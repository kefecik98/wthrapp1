// The seam between the app and whichever weather API is live.
//
// Every provider adapter implements this, converting its own API response
// into ForecastMinute. Nothing outside ./providers knows which provider is
// in use — callers go through forecastCache.getMinutely, which picks the
// configured one (WEATHER_PROVIDER). Swapping providers is then a config
// change, not a code change.

import type { ForecastMinute } from "../weather";

export interface WeatherProvider {
  /** Stable id, matching a WEATHER_PROVIDER value. Also scopes cache keys. */
  readonly name: string;

  /**
   * Minutely forecast for the next ~60 minutes at a point, in our own
   * format. Must throw on any upstream failure (non-2xx, timeout, bad
   * payload) so the cache doesn't store it and the caller can retry.
   */
  fetchMinutely(lat: number, lng: number): Promise<ForecastMinute[]>;
}
