// Tomorrow.io weather client + event-matching logic.
// See weather-app-spec.md sections 6.5 for the data shape and thresholds.

import { config } from "../config";

// Relevant fields from a single minute of the Tomorrow.io minutely timeline.
export interface TomorrowMinute {
  time: string; // ISO timestamp
  values: {
    precipitationIntensity: number; // mm/hr
    precipitationType: number; // 0=none 1=rain 2=snow 3=freezing rain 4=ice pellets (hail)
    precipitationProbability: number; // 0-100
    windSpeed: number; // m/s
    thunderstormProbability?: number; // 0-100 (may be absent on free tier)
  };
}

export type WeatherEventType = "rain" | "snow" | "hail" | "thunder" | "wind";

export interface WeatherEvent {
  type: WeatherEventType;
  minutesAway: number;
  startTime: string; // ISO timestamp
}

// Subset of UserPreferences the matcher needs.
export interface PreferenceThresholds {
  alertRain: boolean;
  alertSnow: boolean;
  alertHail: boolean;
  alertThunder: boolean;
  alertWind: boolean;
  minRainIntensity: string; // 'light' | 'moderate' | 'heavy'
}

// Rain intensity thresholds in mm/hr.
const RAIN_INTENSITY: Record<string, number> = {
  light: 0.25,
  moderate: 2.5,
  heavy: 7.6,
};

// 13.9 m/s ≈ 31 mph: the lower bound of the US NWS Wind Advisory, and the
// wind speed at which outdoor trades (roofing, crane, scaffold) typically
// stop work. Promote to a per-user preference if product wants it tunable.
const WIND_ALERT_MS = 13.9;

function intensityThreshold(level: string): number {
  return RAIN_INTENSITY[level] ?? RAIN_INTENSITY.light;
}

/**
 * Fetch the next 60 minutes of forecast for a point from Tomorrow.io.
 * Throws on a non-2xx response so callers can decide how to handle it.
 */
export async function fetchMinutely(
  lat: number,
  lng: number,
): Promise<TomorrowMinute[]> {
  const url = new URL(`${config.tomorrow.baseUrl}/timelines`);
  url.searchParams.set("location", `${lat},${lng}`);
  url.searchParams.set(
    "fields",
    [
      "precipitationIntensity",
      "precipitationType",
      "precipitationProbability",
      "windSpeed",
      "thunderstormProbability",
    ].join(","),
  );
  url.searchParams.set("timesteps", "1m");
  url.searchParams.set("units", "metric");
  url.searchParams.set("apikey", config.tomorrow.apiKey);

  const res = await fetch(url, {
    method: "GET",
    signal: AbortSignal.timeout(config.tomorrow.timeoutMs),
  });
  if (!res.ok) {
    throw new Error(
      `Tomorrow.io request failed: ${res.status} ${res.statusText}`,
    );
  }

  // Tomorrow.io's /timelines keys each interval by `startTime`; the matcher
  // reads `time`, so normalise here rather than leak the API shape inward.
  const body = (await res.json()) as {
    data?: {
      timelines?: {
        intervals?: { startTime: string; values: TomorrowMinute["values"] }[];
      }[];
    };
  };
  const intervals = body.data?.timelines?.[0]?.intervals ?? [];
  return intervals.map((i) => ({ time: i.startTime, values: i.values }));
}

/**
 * Find the first upcoming minute that matches one of the user's enabled
 * event types. Returns null when nothing relevant is forecast.
 */
export function findNextEvent(
  minutes: TomorrowMinute[],
  prefs: PreferenceThresholds,
): WeatherEvent | null {
  for (const minute of minutes) {
    const v = minute.values;
    const minutesAway = Math.round(
      (new Date(minute.time).getTime() - Date.now()) / 60000,
    );
    if (minutesAway < 0) continue; // skip timestamps already in the past

    if (
      prefs.alertRain &&
      v.precipitationType === 1 &&
      v.precipitationIntensity >= intensityThreshold(prefs.minRainIntensity)
    ) {
      return { type: "rain", minutesAway, startTime: minute.time };
    }

    if (prefs.alertSnow && v.precipitationType === 2) {
      return { type: "snow", minutesAway, startTime: minute.time };
    }

    if (prefs.alertHail && v.precipitationType === 4) {
      return { type: "hail", minutesAway, startTime: minute.time };
    }

    if (
      prefs.alertThunder &&
      (v.thunderstormProbability ?? 0) > 70
    ) {
      return { type: "thunder", minutesAway, startTime: minute.time };
    }

    if (prefs.alertWind && v.windSpeed >= WIND_ALERT_MS) {
      return { type: "wind", minutesAway, startTime: minute.time };
    }
  }
  return null;
}
