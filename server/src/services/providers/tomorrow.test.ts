// Tomorrow.io adapter tests. fetch is stubbed, so no real API calls.

import { afterEach, describe, expect, it, vi } from "vitest";
import { fetchMinutely, tomorrowProvider } from "./tomorrow";

describe("tomorrowProvider", () => {
  it("is registered under the WEATHER_PROVIDER name", () => {
    expect(tomorrowProvider.name).toBe("tomorrow");
    expect(tomorrowProvider.fetchMinutely).toBe(fetchMinutely);
  });
});

describe("fetchMinutely", () => {
  afterEach(() => vi.unstubAllGlobals());

  // Regression guard: Tomorrow.io's /timelines returns each interval keyed by
  // `startTime`, but the matcher reads `time`. fetchMinutely must normalise.
  it("maps Tomorrow.io's startTime onto the internal time field", async () => {
    const startTime = "2026-05-28T20:01:00Z";
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({
        ok: true,
        json: async () => ({
          data: {
            timelines: [
              {
                intervals: [
                  {
                    startTime,
                    values: {
                      precipitationIntensity: 0,
                      precipitationType: 0,
                      precipitationProbability: 0,
                      windSpeed: 0,
                    },
                  },
                ],
              },
            ],
          },
        }),
      })),
    );

    const minutes = await fetchMinutely(40.7, -74);
    expect(minutes).toHaveLength(1);
    expect(minutes[0].time).toBe(startTime);
  });

  it("throws on a non-2xx response", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({
        ok: false,
        status: 429,
        statusText: "Too Many Requests",
      })),
    );
    await expect(fetchMinutely(0, 0)).rejects.toThrow(/429/);
  });
});
