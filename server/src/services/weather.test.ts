// Unit tests for the weather event-matching logic (no network / DB).

import { describe, expect, it } from "vitest";
import {
  findNextEvent,
  PreferenceThresholds,
  TomorrowMinute,
} from "./weather";

const ALL_ON: PreferenceThresholds = {
  alertRain: true,
  alertSnow: true,
  alertHail: true,
  alertThunder: true,
  alertWind: true,
  minRainIntensity: "light",
};

// Build a minute `offsetMin` minutes from now with the given values.
function minute(
  offsetMin: number,
  values: Partial<TomorrowMinute["values"]>,
): TomorrowMinute {
  return {
    time: new Date(Date.now() + offsetMin * 60_000).toISOString(),
    values: {
      precipitationIntensity: 0,
      precipitationType: 0,
      precipitationProbability: 0,
      windSpeed: 0,
      ...values,
    },
  };
}

describe("findNextEvent", () => {
  it("returns null when nothing relevant is forecast", () => {
    expect(findNextEvent([minute(5, {})], ALL_ON)).toBeNull();
  });

  it("matches rain at or above the light intensity threshold", () => {
    const ev = findNextEvent(
      [minute(10, { precipitationType: 1, precipitationIntensity: 0.25 })],
      ALL_ON,
    );
    expect(ev?.type).toBe("rain");
    expect(ev?.minutesAway).toBe(10);
  });

  it("ignores rain below the configured intensity threshold", () => {
    const prefs = { ...ALL_ON, minRainIntensity: "moderate" };
    expect(
      findNextEvent(
        [minute(5, { precipitationType: 1, precipitationIntensity: 1.0 })],
        prefs,
      ),
    ).toBeNull();
    expect(
      findNextEvent(
        [minute(5, { precipitationType: 1, precipitationIntensity: 3.0 })],
        prefs,
      )?.type,
    ).toBe("rain");
  });

  it("matches snow and hail by precipitation type", () => {
    expect(
      findNextEvent([minute(3, { precipitationType: 2 })], ALL_ON)?.type,
    ).toBe("snow");
    expect(
      findNextEvent([minute(3, { precipitationType: 4 })], ALL_ON)?.type,
    ).toBe("hail");
  });

  it("matches thunder only above 70% probability", () => {
    expect(
      findNextEvent([minute(3, { thunderstormProbability: 70 })], ALL_ON),
    ).toBeNull();
    expect(
      findNextEvent([minute(3, { thunderstormProbability: 80 })], ALL_ON)
        ?.type,
    ).toBe("thunder");
  });

  it("matches wind at or above the NWS advisory threshold (13.9 m/s)", () => {
    expect(
      findNextEvent([minute(3, { windSpeed: 12 })], ALL_ON),
    ).toBeNull();
    expect(
      findNextEvent([minute(3, { windSpeed: 14 })], ALL_ON)?.type,
    ).toBe("wind");
  });

  it("skips timestamps already in the past", () => {
    const ev = findNextEvent(
      [
        minute(-5, { precipitationType: 1, precipitationIntensity: 5 }),
        minute(8, { precipitationType: 2 }),
      ],
      ALL_ON,
    );
    expect(ev?.type).toBe("snow");
    expect(ev?.minutesAway).toBe(8);
  });

  it("respects disabled event types", () => {
    const prefs = { ...ALL_ON, alertRain: false };
    expect(
      findNextEvent(
        [minute(5, { precipitationType: 1, precipitationIntensity: 9 })],
        prefs,
      ),
    ).toBeNull();
  });
});
