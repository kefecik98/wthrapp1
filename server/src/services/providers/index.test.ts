// The registry hands out the adapter WEATHER_PROVIDER names.

import { describe, expect, it } from "vitest";
import { weatherProvider } from "./index";
import { tomorrowProvider } from "./tomorrow";

describe("weatherProvider", () => {
  it("returns the configured adapter (tomorrow by default)", () => {
    expect(weatherProvider()).toBe(tomorrowProvider);
  });
});
