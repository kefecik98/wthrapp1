// A stand-in weather provider for tests, so nothing hits a real API.
//
// Usage — the factory imports this same module, so the test and the mocked
// registry share one `fakeFetch`:
//
//   vi.mock("../services/providers", async () =>
//     (await import("../test/fakeProvider")).providersMock);
//   import { fakeFetch } from "../test/fakeProvider";

import { vi } from "vitest";
import type { ForecastMinute } from "../services/weather";

export const fakeFetch =
  vi.fn<(lat: number, lng: number) => Promise<ForecastMinute[]>>();

export const providersMock = {
  weatherProvider: () => ({ name: "fake", fetchMinutely: fakeFetch }),
};
