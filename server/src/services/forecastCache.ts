// Cross-cycle forecast cache.
//
// Tomorrow.io bills per call, and the alert engine's call volume used to be
// `runs/day × occupied cells` because the cache was rebuilt on every cycle.
// Caching by grid cell *across* cycles decouples spend from cron cadence:
// volume becomes `(1440 / ttlMinutes) × cells` no matter how often the engine
// runs or how many users share a cell. At the default 10-minute TTL that is
// ~144 calls/day/cell, down from ~288 (paid tier) plus the free tier's hourly
// pass and every in-app `GET /weather`.
//
// Staleness is safe by construction: each minute in the forecast carries its
// own absolute timestamp, and `findNextEvent` recomputes `minutesAway` against
// `Date.now()` and skips minutes already in the past. A cached forecast just
// has a shorter remaining horizon — with a 10-minute TTL the worst case is a
// ~50-minute lookahead instead of ~60, still well past the 60-minute maximum
// lead time the client can request.

import { config } from "../config";
import { cellKey, snapToGrid } from "../lib/grid";
import { fetchMinutely, TomorrowMinute } from "./weather";

interface CacheEntry {
  minutes: TomorrowMinute[];
  expiresAt: number;
}

const cache = new Map<string, CacheEntry>();

// In-flight requests, so concurrent callers for the same cell (the free and
// paid cycles overlapping, or several `GET /weather` requests) share a single
// upstream call instead of racing to fill the same key.
const inFlight = new Map<string, Promise<TomorrowMinute[]>>();

/**
 * Forecast cell key (`FORECAST_CELL_DEG`, default 0.1° ≈ 11 km). Every user
 * in a cell shares one upstream call and one forecast.
 */
export function gridKey(lat: number, lng: number): string {
  return cellKey(lat, lng, config.forecast.cellDeg);
}

/** Drop expired entries. Called on each miss, so the map can't grow forever. */
function prune(now: number): void {
  for (const [key, entry] of cache) {
    if (entry.expiresAt <= now) cache.delete(key);
  }
  // Hard ceiling in case a huge user base keeps every entry live. Map
  // iterates in insertion order, so this evicts the oldest keys first.
  const overflow = cache.size - config.forecast.cacheMaxEntries;
  if (overflow > 0) {
    let dropped = 0;
    for (const key of cache.keys()) {
      cache.delete(key);
      if (++dropped >= overflow) break;
    }
  }
}

/**
 * Minutely forecast for a point, served from the grid-cell cache when fresh.
 * Errors are not cached — a failed fetch simply leaves the cell empty so the
 * next caller retries.
 */
export async function getMinutely(
  lat: number,
  lng: number,
): Promise<TomorrowMinute[]> {
  const key = gridKey(lat, lng);
  const now = Date.now();

  const hit = cache.get(key);
  if (hit && hit.expiresAt > now) return hit.minutes;

  const pending = inFlight.get(key);
  if (pending) return pending;

  prune(now);

  // Fetch at the cell's centre, not the caller's point: the result is served
  // to everyone in the cell, so it should be centred on the cell — and the
  // weather provider never sees a user's own coordinates.
  const centre = snapToGrid(lat, lng, config.forecast.cellDeg);
  const request = fetchMinutely(centre.lat, centre.lng)
    .then((minutes) => {
      cache.set(key, {
        minutes,
        expiresAt: Date.now() + config.forecast.cacheTtlMs,
      });
      return minutes;
    })
    .finally(() => {
      inFlight.delete(key);
    });

  inFlight.set(key, request);
  return request;
}

/** Empty the cache. Used by tests; also handy from a REPL when debugging. */
export function clearForecastCache(): void {
  cache.clear();
  inFlight.clear();
}

/** Current cache occupancy, for logging and tests. */
export function forecastCacheSize(): number {
  return cache.size;
}
