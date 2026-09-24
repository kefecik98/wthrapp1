// Pirate Weather adapter tests. fetch is stubbed, so nothing hits a server.
//
// Two kinds of fixture:
// - pirateWeather.sample.json is hand-built from the documented Dark Sky
//   format, to cover cases real weather rarely offers on demand (snow,
//   thunder, wind, missing data).
// - *.real.json are real responses from the self-hosted instance, captured
//   with the adapter's exact query (server/deploy/weather/README.md step 8).
//   The contract tests at the bottom run over every one of them.

import { afterEach, describe, expect, it, vi } from "vitest";
import { config } from "../../config";
import { findNextEvent, PreferenceThresholds } from "../weather";
import sample from "./fixtures/pirateWeather.sample.json";
import {
  fetchMinutely,
  PirateDataPoint,
  PirateResponse,
  pirateWeatherProvider,
  toForecastMinutes,
} from "./pirateWeather";

const T0 = sample.minutely.data[0].time;

/** A minimal response with the given minutely points and one hourly point. */
function body(
  minutes: Omit<PirateDataPoint, "time">[],
  hour: PirateDataPoint = { time: T0, windSpeed: 3, cape: 0 },
): PirateResponse {
  return {
    minutely: { data: minutes.map((m, i) => ({ time: T0 + 60 * i, ...m })) },
    hourly: { data: [hour] },
  };
}

describe("toForecastMinutes — the sample response", () => {
  const minutes = toForecastMinutes(sample);

  it("keeps every minute, with unix time converted to ISO", () => {
    expect(minutes).toHaveLength(61);
    expect(minutes[0].time).toBe(new Date(T0 * 1000).toISOString());
  });

  it("maps rain: intensity in mm/h, probability to 0–100, code 1", () => {
    expect(minutes[10].values).toMatchObject({
      precipitationIntensity: 1.2,
      precipitationProbability: 64,
      precipitationType: 1,
    });
  });

  it("maps snow to code 2", () => {
    expect(minutes[20].values.precipitationType).toBe(2);
  });

  it("drops a precip type that has no intensity", () => {
    // Minute 30 says "snow" at 0 mm/h. The matcher alerts on snow by type
    // alone, so passing it through would be a false alert.
    expect(minutes[30].values.precipitationType).toBe(0);
  });

  it("takes wind speed from the hour each minute falls in", () => {
    expect(minutes[0].values.windSpeed).toBe(4.2); // first hour
    expect(minutes[60].values.windSpeed).toBe(15.1); // T0 + 60 min → second hour
  });

  it("derives thunder from high CAPE only while precipitating", () => {
    expect(minutes[10].values.thunderstormProbability).toBe(100); // CAPE 3100, raining
    expect(minutes[0].values.thunderstormProbability).toBe(0); // CAPE 3100, dry
    expect(minutes[60].values.thunderstormProbability).toBe(0); // CAPE 120
  });
});

describe("toForecastMinutes — precipitation types", () => {
  it.each([
    ["none", 0],
    ["rain", 1],
    ["snow", 2],
    ["ice", 3], // freezing rain
    ["sleet", 4], // surfaced to users as "hail", as on Tomorrow.io
    ["mixed", 2], // wintry mix → snow, never hail
    ["something-new", 0], // unknown future type → no alert
  ])("%s → %i", (precipType, code) => {
    const [m] = toForecastMinutes(
      body([{ precipIntensity: 1, precipType }]),
    );
    expect(m.values.precipitationType).toBe(code);
  });
});

describe("toForecastMinutes — missing data", () => {
  it("treats null, NaN and negative sentinels as no data", () => {
    const [a, b, c] = toForecastMinutes(
      body(
        [
          { precipIntensity: null, precipProbability: null, precipType: "rain" },
          { precipIntensity: NaN, precipProbability: NaN, precipType: "rain" },
          { precipIntensity: -999, precipProbability: -999, precipType: "rain" },
        ],
        { time: T0, windSpeed: -999, cape: NaN },
      ),
    );
    for (const m of [a, b, c]) {
      expect(m.values).toEqual({
        precipitationIntensity: 0,
        precipitationType: 0,
        precipitationProbability: 0,
        windSpeed: 0,
        thunderstormProbability: 0,
      });
    }
  });

  it("uses zero wind when no hourly block covers the minute", () => {
    const [m] = toForecastMinutes({
      minutely: { data: [{ time: T0, precipIntensity: 0 }] },
    });
    expect(m.values.windSpeed).toBe(0);
  });

  it("throws when there is no minutely data, so nothing is cached", () => {
    expect(() => toForecastMinutes({ hourly: { data: [] } })).toThrow(
      /no minutely data/,
    );
    expect(() => toForecastMinutes({ minutely: { data: [] } })).toThrow(
      /no minutely data/,
    );
  });
});

describe("with the real matcher", () => {
  const ALL_ON: PreferenceThresholds = {
    alertRain: true,
    alertSnow: true,
    alertHail: true,
    alertThunder: true,
    alertWind: true,
    minRainIntensity: "light",
  };

  it("finds the first event in the sample (rain, in its first minute)", () => {
    // Shift the sample so it starts now, as a fresh response would.
    const shift = Math.floor(Date.now() / 1000) - T0 + 60;
    const live = {
      ...sample,
      minutely: {
        data: sample.minutely.data.map((m) => ({ ...m, time: m.time + shift })),
      },
      hourly: {
        data: sample.hourly.data.map((h) => ({ ...h, time: h.time + shift })),
      },
    };
    const event = findNextEvent(toForecastMinutes(live), ALL_ON);
    expect(event?.type).toBe("rain");
  });
});

describe("fetchMinutely", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("calls /forecast/<key>/<lat>,<lng> in SI units, minutely + hourly only", async () => {
    const fetchSpy = vi.fn(async () => ({ ok: true, json: async () => sample }));
    vi.stubGlobal("fetch", fetchSpy);

    const minutes = await fetchMinutely(47.595, -122.325);

    expect(minutes).toHaveLength(61);
    const url = new URL(String((fetchSpy.mock.calls[0] as unknown[])[0]));
    expect(url.pathname).toMatch(
      new RegExp(`/forecast/${config.pirateWeather.apiKey}/47\\.595,-122\\.325$`),
    );
    expect(url.searchParams.get("units")).toBe("si");
    // Without version=2 the hourly block has no `cape` (seen on the real
    // instance), which would silently disable thunder alerts.
    expect(url.searchParams.get("version")).toBe("2");
    expect(url.searchParams.get("exclude")).toBe("currently,daily,alerts");
  });

  it("bounds every request with a timeout", async () => {
    const fetchSpy = vi.fn(async () => ({ ok: true, json: async () => sample }));
    vi.stubGlobal("fetch", fetchSpy);
    await fetchMinutely(0, 0);
    const init = (fetchSpy.mock.calls[0] as unknown[])[1] as RequestInit;
    expect(init.signal).toBeInstanceOf(AbortSignal);
  });

  it("says so when no base URL is configured", async () => {
    const saved = config.pirateWeather.baseUrl;
    (config.pirateWeather as { baseUrl: string }).baseUrl = "";
    try {
      await expect(fetchMinutely(0, 0)).rejects.toThrow(
        /PIRATE_WEATHER_BASE_URL is not set/,
      );
    } finally {
      (config.pirateWeather as { baseUrl: string }).baseUrl = saved;
    }
  });

  it("throws on a non-2xx response", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({ ok: false, status: 503, statusText: "Unavailable" })),
    );
    await expect(fetchMinutely(0, 0)).rejects.toThrow(/503/);
  });
});

describe("pirateWeatherProvider", () => {
  it("is registered under the WEATHER_PROVIDER name", () => {
    expect(pirateWeatherProvider.name).toBe("pirate");
    expect(pirateWeatherProvider.fetchMinutely).toBe(fetchMinutely);
  });
});

// ---------------------------------------------------------------------------
// Contract tests against REAL responses from the self-hosted instance
// (fixtures/*.real.json, captured with the adapter's exact query). If a
// Pirate Weather upgrade changes the response, these are what should break.
// ---------------------------------------------------------------------------

import miami from "./fixtures/pirateWeather.miami.real.json";
import stlouis from "./fixtures/pirateWeather.stlouis.real.json";

const REAL: [string, PirateResponse & { flags: { sources: string[] } }][] = [
  ["Miami — light rain ending after 12 min", miami],
  ["St. Louis — typed 'rain' at 0 mm/h, never raining", stlouis],
];

describe.each(REAL)("real response: %s", (_name, body) => {
  const minutes = toForecastMinutes(body);

  it("was served by the 15-minute HRRR (the source minutely alerts need)", () => {
    expect(body.flags.sources).toContain("hrrrsubh");
  });

  it("converts all 61 minutes, one per minute, in order", () => {
    expect(minutes).toHaveLength(61);
    for (let i = 1; i < minutes.length; i++) {
      expect(Date.parse(minutes[i].time) - Date.parse(minutes[i - 1].time)).toBe(60_000);
    }
  });

  it("emits only valid ForecastMinute values", () => {
    for (const { values: v } of minutes) {
      expect([0, 1, 2, 3, 4]).toContain(v.precipitationType);
      expect(v.precipitationIntensity).toBeGreaterThanOrEqual(0);
      expect(Number.isInteger(v.precipitationProbability)).toBe(true);
      expect(v.precipitationProbability).toBeGreaterThanOrEqual(0);
      expect(v.precipitationProbability).toBeLessThanOrEqual(100);
      expect(v.windSpeed).toBeGreaterThanOrEqual(0);
      expect([0, 100]).toContain(v.thunderstormProbability);
    }
  });

  it("never reports a precipitation type without intensity", () => {
    for (const { values: v } of minutes) {
      expect(v.precipitationType !== 0).toBe(v.precipitationIntensity > 0);
    }
  });

  it("has hourly CAPE (only present with version=2)", () => {
    expect(body.hourly?.data?.[0]).toHaveProperty("cape");
  });
});

describe("real response specifics", () => {
  it("Miami: rain now, gone by minute 12", () => {
    const minutes = toForecastMinutes(miami);
    expect(minutes[0].values.precipitationType).toBe(1);
    expect(minutes[0].values.precipitationIntensity).toBeGreaterThan(0);
    expect(minutes.slice(12).every((m) => m.values.precipitationType === 0)).toBe(true);
  });

  it("St. Louis: 'rain' at 0 mm/h produces no precipitation", () => {
    // Real Pirate Weather output: many minutes are typed "rain" while the
    // intensity is 0 all hour. Passed through, the engine would alert on it.
    const typedAtZero = stlouis.minutely.data.filter(
      (m) => m.precipType !== "none" && m.precipIntensity === 0,
    );
    expect(typedAtZero.length).toBeGreaterThan(0);
    expect(stlouis.minutely.data.every((m) => m.precipIntensity === 0)).toBe(true);
    const minutes = toForecastMinutes(stlouis);
    expect(minutes.every((m) => m.values.precipitationType === 0)).toBe(true);
  });
});
