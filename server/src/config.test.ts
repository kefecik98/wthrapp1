// Startup validation for config values that could silently misbehave.
// config.ts reads process.env once at import, so each case re-imports it
// with a fresh module registry.

import { afterEach, describe, expect, it, vi } from "vitest";

async function loadConfigWith(env: Record<string, string | undefined>) {
  vi.resetModules();
  for (const [k, v] of Object.entries(env)) vi.stubEnv(k, v as string);
  return (await import("./config")).config;
}

afterEach(() => {
  vi.unstubAllEnvs();
  vi.resetModules();
});

describe("WEATHER_PROVIDER", () => {
  it("defaults to tomorrow", async () => {
    const saved = process.env.WEATHER_PROVIDER;
    delete process.env.WEATHER_PROVIDER;
    try {
      const config = await loadConfigWith({});
      expect(config.weather.provider).toBe("tomorrow");
    } finally {
      if (saved !== undefined) process.env.WEATHER_PROVIDER = saved;
    }
  });

  it("rejects a provider with no adapter at startup", async () => {
    await expect(loadConfigWith({ WEATHER_PROVIDER: "pirate" })).rejects.toThrow(
      /WEATHER_PROVIDER must be one of tomorrow/,
    );
  });
});

describe("FORECAST_CELL_DEG", () => {
  it("accepts the location grid size", async () => {
    const config = await loadConfigWith({ FORECAST_CELL_DEG: "0.03" });
    expect(config.forecast.cellDeg).toBe(0.03);
  });

  it.each(["0.01", "abc", "-1"])("rejects %s", async (value) => {
    await expect(loadConfigWith({ FORECAST_CELL_DEG: value })).rejects.toThrow(
      /FORECAST_CELL_DEG must be a number >= 0.03/,
    );
  });
});
