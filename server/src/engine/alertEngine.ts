// Alert engine (weather-app-spec.md section 6.3).
// Runs on a cron schedule. For every subscribed user with a recent
// location it checks the forecast and fires a push notification when a
// matching weather event is within the user's configured lead time.
//
// Users are clustered into ~1 km grid cells so we make at most one
// Tomorrow.io call per cell per run, instead of one call per user.

import cron, { ScheduledTask } from "node-cron";
import { prisma } from "../db";
import { config } from "../config";
import {
  fetchMinutely,
  findNextEvent,
  TomorrowMinute,
  WeatherEventType,
} from "../services/weather";
import { sendPush } from "../services/push";

// Human-readable push copy per event type.
const EVENT_LABEL: Record<WeatherEventType, string> = {
  rain: "Rain",
  snow: "Snow",
  hail: "Hail",
  thunder: "Thunderstorm",
  wind: "High wind",
};

/** Grid key: ~0.1° (~11 km) cell. Keeps nearby users on one API call. */
function gridKey(lat: number, lng: number): string {
  const cell = (n: number) => Math.floor(n * 10) / 10;
  return `${cell(lat)}_${cell(lng)}`;
}

/** One pass of the alert engine. Exported so it can be triggered in tests. */
export async function runAlertCycle(): Promise<void> {
  const staleBefore = new Date(
    Date.now() - config.alertEngine.locationStaleMinutes * 60_000,
  );

  // Active = subscribed (active/trial), notifications on, fresh location.
  const users = await prisma.user.findMany({
    where: {
      fcmToken: { not: null },
      subscription: { status: { in: ["active", "trial"] } },
      preferences: { notificationsOn: true },
      location: { updatedAt: { gt: staleBefore } },
    },
    select: {
      id: true,
      fcmToken: true,
      location: true,
      preferences: true,
    },
  });

  if (users.length === 0) return;

  // Cache one forecast per grid cell for the duration of this cycle.
  const forecastCache = new Map<string, TomorrowMinute[]>();

  for (const user of users) {
    const loc = user.location;
    const prefs = user.preferences;
    if (!loc || !prefs || !user.fcmToken) continue;

    const key = gridKey(loc.lat, loc.lng);
    let minutes = forecastCache.get(key);
    if (!minutes) {
      try {
        minutes = await fetchMinutely(loc.lat, loc.lng);
        forecastCache.set(key, minutes);
      } catch (err) {
        console.error(`[alert-engine] forecast failed for ${key}:`, err);
        continue;
      }
    }

    const event = findNextEvent(minutes, prefs);
    if (!event) continue;

    // Only alert when the event is within the user's lead time.
    if (event.minutesAway > prefs.alertLeadMin) continue;

    const eventStartAt = new Date(event.startTime);

    // Deduplicate: the unique (userId, eventType, eventStartAt) constraint
    // means a duplicate insert throws — we treat that as "already alerted".
    try {
      await prisma.alertLog.create({
        data: {
          userId: user.id,
          eventType: event.type,
          eventStartAt,
        },
      });
    } catch {
      continue; // already alerted for this exact event
    }

    const label = EVENT_LABEL[event.type];
    await sendPush({
      token: user.fcmToken,
      title: `${label} in ${event.minutesAway} minutes`,
      body: `${label} expected at your location.`,
      data: {
        event_type: event.type,
        minutes_away: String(event.minutesAway),
      },
    });
  }
}

let task: ScheduledTask | null = null;
// Guards against overlapping runs: node-cron will fire the next tick even if the
// previous cycle is still in flight (e.g. a slow upstream), so without this a
// hung cycle would let runs pile up. Direct callers (tests, trigger_cycle) are
// intentionally not guarded.
let cycleRunning = false;

/** Start the recurring alert engine. */
export function startAlertEngine(): void {
  task = cron.schedule(config.alertEngine.cron, () => {
    if (cycleRunning) {
      console.warn("[alert-engine] previous cycle still running — skipping tick");
      return;
    }
    cycleRunning = true;
    runAlertCycle()
      .catch((err) => console.error("[alert-engine] cycle failed:", err))
      .finally(() => {
        cycleRunning = false;
      });
  });
  console.log(
    `[alert-engine] scheduled with cron "${config.alertEngine.cron}"`,
  );
}

/** Stop the alert engine (used on graceful shutdown). */
export function stopAlertEngine(): void {
  task?.stop();
  task = null;
}
