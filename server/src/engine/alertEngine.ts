// Alert engine (weather-app-spec.md section 6.3).
// Runs on cron schedules and fires a push notification when a matching
// weather event is within range of a user's location. There are two tiers:
//
//   paid — subscribed (active/trial) users. Polled every 5 minutes; honours
//          each user's enabled event types + intensity + lead time.
//   free — everyone else. Polled hourly; rain only, fired for any rain inside
//          the forecast window ("rain expected within the hour"). Reuses the
//          same ~60-minute forecast, so an hourly poll has no coverage gap.
//
// Users are clustered into ~0.1° grid cells so we make at most one Tomorrow.io
// call per cell per run, instead of one call per user.

import cron, { ScheduledTask } from "node-cron";
import { Prisma } from "@prisma/client";
import { prisma } from "../db";
import { config } from "../config";
import {
  fetchMinutely,
  findNextEvent,
  PreferenceThresholds,
  TomorrowMinute,
  WeatherEvent,
  WeatherEventType,
} from "../services/weather";
import { sendPush } from "../services/push";

export type AlertTier = "paid" | "free";

// Human-readable push copy per event type (paid tier).
const EVENT_LABEL: Record<WeatherEventType, string> = {
  rain: "Rain",
  snow: "Snow",
  hail: "Hail",
  thunder: "Thunderstorm",
  wind: "High wind",
};

// Free tier is rain-only at a fixed threshold. Customisation (other event
// types, intensity, lead time) is a paid feature, so the free matcher ignores
// the user's per-event preferences.
const FREE_TIER_THRESHOLDS: PreferenceThresholds = {
  alertRain: true,
  alertSnow: false,
  alertHail: false,
  alertThunder: false,
  alertWind: false,
  minRainIntensity: "light",
};

// Which users each tier targets. Paid = an active/trial subscription; free =
// everyone else (no subscription row, or an expired/cancelled one).
const TIER_FILTER: Record<AlertTier, Prisma.UserWhereInput> = {
  paid: { subscription: { status: { in: ["active", "trial"] } } },
  free: {
    OR: [
      { subscription: { is: null } },
      { subscription: { status: { notIn: ["active", "trial"] } } },
    ],
  },
};

/** Grid key: ~0.1° (~11 km) cell. Keeps nearby users on one API call. */
function gridKey(lat: number, lng: number): string {
  const cell = (n: number) => Math.floor(n * 10) / 10;
  return `${cell(lat)}_${cell(lng)}`;
}

/** Build the push payload for a matched event, per tier. */
function buildPush(tier: AlertTier, token: string, event: WeatherEvent) {
  const data = {
    event_type: event.type,
    minutes_away: String(event.minutesAway),
  };
  if (tier === "free") {
    return {
      token,
      title: "Rain expected within the hour",
      body: "Rain is likely at your location within the next hour.",
      data,
    };
  }
  const label = EVENT_LABEL[event.type];
  return {
    token,
    title: `${label} in ${event.minutesAway} minutes`,
    body: `${label} expected at your location.`,
    data,
  };
}

/**
 * One pass of the alert engine for a given tier. Exported (and defaulted to
 * "paid") so it can be triggered directly in tests.
 */
export async function runAlertCycle(tier: AlertTier = "paid"): Promise<void> {
  const staleBefore = new Date(
    Date.now() - config.alertEngine.locationStaleMinutes * 60_000,
  );

  const users = await prisma.user.findMany({
    where: {
      fcmToken: { not: null },
      preferences: { notificationsOn: true },
      location: { updatedAt: { gt: staleBefore } },
      ...TIER_FILTER[tier],
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

    // Paid honours the user's enabled events; free is rain-only. Paid also
    // gates on the user's lead time, while free fires for any rain inside the
    // forecast window (the hourly poll matches the ~60-min horizon, i.e.
    // "within the hour").
    const event =
      tier === "paid"
        ? findNextEvent(minutes, prefs)
        : findNextEvent(minutes, FREE_TIER_THRESHOLDS);
    if (!event) continue;
    if (tier === "paid" && event.minutesAway > prefs.alertLeadMin) continue;

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

    await sendPush(buildPush(tier, user.fcmToken, event));
  }
}

// One guarded scheduled task per tier. node-cron fires the next tick even if
// the previous cycle is still in flight (e.g. a slow upstream), so without this
// guard a hung cycle would let runs pile up. Direct callers (tests,
// trigger_cycle) are intentionally unguarded.
function scheduleGuarded(cronExpr: string, tier: AlertTier): ScheduledTask {
  let running = false;
  return cron.schedule(cronExpr, () => {
    if (running) {
      console.warn(
        `[alert-engine] previous ${tier} cycle still running — skipping tick`,
      );
      return;
    }
    running = true;
    runAlertCycle(tier)
      .catch((err) =>
        console.error(`[alert-engine] ${tier} cycle failed:`, err),
      )
      .finally(() => {
        running = false;
      });
  });
}

let tasks: ScheduledTask[] = [];

/** Start the recurring alert engine (paid + free tiers). */
export function startAlertEngine(): void {
  tasks = [
    scheduleGuarded(config.alertEngine.cron, "paid"),
    scheduleGuarded(config.alertEngine.freeCron, "free"),
  ];
  console.log(
    `[alert-engine] scheduled — paid "${config.alertEngine.cron}", free "${config.alertEngine.freeCron}"`,
  );
}

/** Stop the alert engine (used on graceful shutdown). */
export function stopAlertEngine(): void {
  for (const task of tasks) task.stop();
  tasks = [];
}
