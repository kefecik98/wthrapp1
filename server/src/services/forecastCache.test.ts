// Unit tests for the cross-cycle forecast cache. Pure logic — no database,
// and the weather provider is faked (test/fakeProvider) so nothing hits the
// network.

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("./providers", async () =>
  (await import("../test/fakeProvider")).providersMock,
);

import { config } from "../config";
import { fakeFetch } from "../test/fakeProvider";
import type { ForecastMinute } from "./weather";
import {
  clearForecastCache,
  forecastCacheSize,
  getMinutely,
} from "./forecastCache";

const mockFetch = fakeFetch;

/** Minimal forecast payload; contents don't matter to the cache. */
function minutes(label: string): ForecastMinute[] {
  return [
    {
      time: new Date(Date.now() + 60_000).toISOString(),
      values: {
        precipitationIntensity: 1,
        precipitationType: 1,
        precipitationProbability: 90,
        windSpeed: 2,
        // Stash the label so a test can tell one payload from another.
        thunderstormProbability: Number(label),
      },
    },
  ];
}

beforeEach(() => {
  // Fake only Date, so Date.now() is controllable while promise microtasks
  // still resolve normally.
  vi.useFakeTimers({ toFake: ["Date"] });
  clearForecastCache();
  mockFetch.mockReset();
});

afterEach(() => {
  vi.useRealTimers();
});

describe("getMinutely", () => {
  it("fetches once and serves later calls for the same point from cache", async () => {
    mockFetch.mockResolvedValue(minutes("1"));

    await getMinutely(40.71, -74.01);
    await getMinutely(40.71, -74.01);
    await getMinutely(40.71, -74.01);

    expect(mockFetch).toHaveBeenCalledTimes(1);
  });

  it("serves a different point in the same ~0.1° cell from the same entry", async () => {
    mockFetch.mockResolvedValue(minutes("1"));

    await getMinutely(40.71, -74.01);
    await getMinutely(40.79, -74.09); // same 40.7 / -74.1 cell

    expect(mockFetch).toHaveBeenCalledTimes(1);
    expect(forecastCacheSize()).toBe(1);
  });

  it("fetches at the cell centre, not the caller's point", async () => {
    mockFetch.mockResolvedValue(minutes("1"));

    await getMinutely(40.71, -74.01);

    // Default 0.1° cell: 40.7..40.8 / -74.1..-74.0 → centre 40.75 / -74.05.
    // The provider never sees the user's own coordinates.
    expect(mockFetch).toHaveBeenCalledWith(40.75, -74.05);
  });

  it("fetches separately for points in different cells", async () => {
    mockFetch.mockResolvedValue(minutes("1"));

    await getMinutely(40.71, -74.01);
    await getMinutely(51.5, -0.12);

    expect(mockFetch).toHaveBeenCalledTimes(2);
    expect(forecastCacheSize()).toBe(2);
  });

  it("refetches once the TTL has elapsed", async () => {
    mockFetch.mockResolvedValue(minutes("1"));

    await getMinutely(40.71, -74.01);
    vi.advanceTimersByTime(config.forecast.cacheTtlMs - 1);
    await getMinutely(40.71, -74.01);
    expect(mockFetch).toHaveBeenCalledTimes(1);

    vi.advanceTimersByTime(2);
    await getMinutely(40.71, -74.01);
    expect(mockFetch).toHaveBeenCalledTimes(2);
  });

  it("survives a cycle boundary — the point of the cross-cycle cache", async () => {
    mockFetch.mockResolvedValue(minutes("1"));

    // Two alert cycles five minutes apart, well inside the 10-minute TTL.
    await getMinutely(40.71, -74.01);
    vi.advanceTimersByTime(5 * 60_000);
    await getMinutely(40.71, -74.01);

    expect(mockFetch).toHaveBeenCalledTimes(1);
  });

  it("collapses concurrent calls for the same cell into one fetch", async () => {
    let resolveFetch: (v: ForecastMinute[]) => void = () => {};
    mockFetch.mockReturnValue(
      new Promise<ForecastMinute[]>((r) => {
        resolveFetch = r;
      }),
    );

    const payload = minutes("1");
    const all = Promise.all([
      getMinutely(40.71, -74.01),
      getMinutely(40.72, -74.02),
      getMinutely(40.73, -74.03),
    ]);
    resolveFetch(payload);

    const results = await all;
    expect(mockFetch).toHaveBeenCalledTimes(1);
    for (const r of results) expect(r).toEqual(payload);
  });

  it("does not cache a failure — the next caller retries", async () => {
    mockFetch.mockRejectedValueOnce(new Error("upstream 503"));
    await expect(getMinutely(40.71, -74.01)).rejects.toThrow("upstream 503");
    expect(forecastCacheSize()).toBe(0);

    mockFetch.mockResolvedValueOnce(minutes("2"));
    await expect(getMinutely(40.71, -74.01)).resolves.toHaveLength(1);
    expect(mockFetch).toHaveBeenCalledTimes(2);
  });

  it("prunes expired entries instead of growing without bound", async () => {
    mockFetch.mockResolvedValue(minutes("1"));

    await getMinutely(40.7, -74.0);
    await getMinutely(51.5, -0.1);
    expect(forecastCacheSize()).toBe(2);

    // Past the TTL, a miss on a third cell prunes the two stale entries.
    vi.advanceTimersByTime(config.forecast.cacheTtlMs + 1);
    await getMinutely(35.6, 139.7);
    expect(forecastCacheSize()).toBe(1);
  });
});
