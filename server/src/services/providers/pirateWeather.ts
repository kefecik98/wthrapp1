// Pirate Weather adapter — intended for a self-hosted instance on the rack's
// LAN (server/deploy/weather/), though it works against the hosted API too.
//
// Pirate Weather speaks the Dark Sky format: GET
// /forecast/<key>/<lat>,<lng>?units=si returns `minutely` (61 one-minute
// points) and `hourly` blocks with unix-second times. This converts that into
// ForecastMinute, which is a wire contract with installed apps — so every
// difference is absorbed here, never pushed into the shared shape:
//
// - time: unix seconds → ISO string.
// - precipType: strings → Tomorrow.io's numeric codes (see PRECIP_CODE).
// - precipProbability: 0–1 → 0–100.
// - windSpeed: minutely has none, so each minute takes the hourly value for
//   the hour it falls in.
// - thunderstormProbability: Pirate Weather has none. It is derived from
//   hourly CAPE with Pirate Weather's own threshold, and only where
//   precipitation is actually forecast (see thunderProbability). This is a
//   heuristic; shadow mode is where it gets validated.
//
// Missing values: Pirate Weather replaces every missing number with -999
// before responding (responseLocal.py, `replace_nan(returnOBJ, -999)`). Any
// negative, null or non-finite reading is treated as "no data".

import { config } from "../../config";
import type { ForecastMinute } from "../weather";
import type { WeatherProvider } from "./types";

/** Dark Sky-style data point, as far as this adapter reads it. */
export interface PirateDataPoint {
  time: number; // unix seconds
  precipIntensity?: number | null; // mm/h with units=si
  precipProbability?: number | null; // 0–1
  precipType?: string | null; // none | rain | snow | sleet | ice | mixed
  windSpeed?: number | null; // m/s with units=si
  cape?: number | null; // J/kg (hourly only)
}

export interface PirateResponse {
  minutely?: { data?: PirateDataPoint[] };
  hourly?: { data?: PirateDataPoint[] };
}

/**
 * Pirate Weather precipType → ForecastMinute.precipitationType
 * (0=none 1=rain 2=snow 3=freezing rain 4=ice pellets).
 *
 * `sleet` is Pirate Weather's "neither rain nor snow" bucket, which is what
 * code 4 (ice pellets, surfaced as "hail") already meant on Tomorrow.io.
 * `mixed` (rain + snow + ice together) maps to snow: it is wintry, and
 * calling it hail would be wrong.
 */
const PRECIP_CODE: Record<string, number> = {
  none: 0,
  rain: 1,
  snow: 2,
  ice: 3,
  sleet: 4,
  mixed: 2,
};

/** Pirate Weather's own thunderstorm threshold: CAPE ≥ 2500 J/kg. */
const THUNDER_CAPE_J_PER_KG = 2500;

/** A usable reading, or undefined for null / NaN / negative sentinels. */
function reading(value: number | null | undefined): number | undefined {
  return typeof value === "number" && Number.isFinite(value) && value >= 0
    ? value
    : undefined;
}

/** The hourly point covering `time` (unix seconds), if any. */
function hourFor(
  hours: PirateDataPoint[],
  time: number,
): PirateDataPoint | undefined {
  // Hourly points are sorted and start on the hour; take the last one that
  // has started. Linear is fine — there are at most ~48.
  let match: PirateDataPoint | undefined;
  for (const h of hours) {
    if (h.time <= time) match = h;
    else break;
  }
  return match;
}

/**
 * 100 when the hour is convectively unstable enough for Pirate Weather to
 * call it a thunderstorm AND precipitation is forecast this minute, else 0.
 * Requiring precipitation stops a dry, unstable afternoon from alerting.
 */
function thunderProbability(
  hour: PirateDataPoint | undefined,
  intensity: number,
): number {
  const cape = reading(hour?.cape);
  return cape !== undefined && cape >= THUNDER_CAPE_J_PER_KG && intensity > 0
    ? 100
    : 0;
}

/** Convert a Pirate Weather response into ForecastMinute[]. */
export function toForecastMinutes(body: PirateResponse): ForecastMinute[] {
  const minutes = body.minutely?.data;
  if (!Array.isArray(minutes) || minutes.length === 0) {
    // No minutely block means no alerting data at all — fail loudly so the
    // cache doesn't store it and the next cycle retries.
    throw new Error("Pirate Weather response has no minutely data");
  }
  const hours = body.hourly?.data ?? [];

  return minutes.map((m) => {
    const hour = hourFor(hours, m.time);
    const intensity = reading(m.precipIntensity) ?? 0;
    // A type with zero intensity is not precipitation. The matcher alerts
    // on snow/hail by type alone, so this guard prevents false alerts.
    const type =
      intensity > 0 ? (PRECIP_CODE[m.precipType ?? "none"] ?? 0) : 0;
    const probability = reading(m.precipProbability);

    return {
      time: new Date(m.time * 1000).toISOString(),
      values: {
        precipitationIntensity: intensity,
        precipitationType: type,
        precipitationProbability:
          probability === undefined ? 0 : Math.round(probability * 100),
        windSpeed: reading(hour?.windSpeed) ?? 0,
        thunderstormProbability: thunderProbability(hour, intensity),
      },
    };
  });
}

/**
 * Fetch the next ~60 minutes for a point. Throws on a non-2xx response, a
 * timeout, or a payload without minutely data.
 */
export async function fetchMinutely(
  lat: number,
  lng: number,
): Promise<ForecastMinute[]> {
  const { baseUrl, apiKey, timeoutMs } = config.pirateWeather;
  if (!baseUrl) {
    // Config only requires it when Pirate Weather is live; a shadow run
    // with it unset should say so, not fail with "Invalid URL".
    throw new Error("PIRATE_WEATHER_BASE_URL is not set");
  }
  const url = new URL(
    `${baseUrl.replace(/\/+$/, "")}/forecast/${encodeURIComponent(apiKey)}/${lat},${lng}`,
  );
  url.searchParams.set("units", "si");
  // Only minutely + hourly are read; skip the rest to keep responses small.
  url.searchParams.set("exclude", "currently,daily,alerts");

  const res = await fetch(url, {
    method: "GET",
    signal: AbortSignal.timeout(timeoutMs),
  });
  if (!res.ok) {
    throw new Error(
      `Pirate Weather request failed: ${res.status} ${res.statusText}`,
    );
  }
  return toForecastMinutes((await res.json()) as PirateResponse);
}

export const pirateWeatherProvider: WeatherProvider = {
  name: "pirate",
  fetchMinutely,
};
