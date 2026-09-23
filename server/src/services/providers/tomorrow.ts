// Tomorrow.io adapter (the launch provider).
// Calls the /timelines endpoint with a 1-minute timestep and converts the
// response into ForecastMinute. Tomorrow.io's field names and precipitation
// codes are what ForecastMinute was modelled on, so the only real conversion
// is `startTime` → `time`.

import { config } from "../../config";
import type { ForecastMinute } from "../weather";
import type { WeatherProvider } from "./types";

/**
 * Fetch the next 60 minutes of forecast for a point from Tomorrow.io.
 * Throws on a non-2xx response so callers can decide how to handle it.
 */
export async function fetchMinutely(
  lat: number,
  lng: number,
): Promise<ForecastMinute[]> {
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
        intervals?: { startTime: string; values: ForecastMinute["values"] }[];
      }[];
    };
  };
  const intervals = body.data?.timelines?.[0]?.intervals ?? [];
  return intervals.map((i) => ({ time: i.startTime, values: i.values }));
}

export const tomorrowProvider: WeatherProvider = {
  name: "tomorrow",
  fetchMinutely,
};
