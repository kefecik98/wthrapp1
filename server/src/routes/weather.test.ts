// Integration tests for GET /weather. fetchMinutely (Tomorrow.io) is
// mocked so tests never make a real HTTP request.

import { FastifyInstance } from "fastify";
import {
  afterAll,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";

vi.mock("../services/weather", async () => {
  const real = await vi.importActual<typeof import("../services/weather")>(
    "../services/weather",
  );
  return {
    ...real,
    fetchMinutely: vi.fn(),
  };
});

import { prisma } from "../db";
import { bearer, buildTestApp, resetDb } from "../test/helpers";
import { fetchMinutely } from "../services/weather";
import { clearForecastCache } from "../services/forecastCache";

const mockFetch = vi.mocked(fetchMinutely);

let app: FastifyInstance;

beforeAll(async () => {
  app = await buildTestApp();
});

afterAll(async () => {
  await app.close();
  await prisma.$disconnect();
});

beforeEach(async () => {
  await resetDb();
  // /weather reads through the shared grid-cell cache, which is module-level
  // and outlives a request by design — start each test from an empty one.
  clearForecastCache();
  mockFetch.mockReset();
});

async function makeUserWithLocation() {
  const user = await prisma.user.create({
    data: {
      email: "wx@example.com",
      passwordHash: "x",
      preferences: { create: {} },
      location: { create: { lat: 40.7, lng: -74.0 } },
    },
  });
  return user;
}

describe("GET /weather", () => {
  it("returns 401 without a token", async () => {
    const res = await app.inject({ method: "GET", url: "/weather" });
    expect(res.statusCode).toBe(401);
  });

  it("returns 404 when the user has no location on file", async () => {
    const user = await prisma.user.create({
      data: { email: "noloc@example.com", passwordHash: "x" },
    });
    const res = await app.inject({
      method: "GET",
      url: "/weather",
      headers: bearer(user.id),
    });
    expect(res.statusCode).toBe(404);
  });

  it("returns the location + forecast on success", async () => {
    const user = await makeUserWithLocation();
    const minutes = [
      {
        time: new Date(Date.now() + 5 * 60_000).toISOString(),
        values: {
          precipitationIntensity: 1.5,
          precipitationType: 1,
          precipitationProbability: 80,
          windSpeed: 3,
        },
      },
    ];
    mockFetch.mockResolvedValueOnce(minutes);

    const res = await app.inject({
      method: "GET",
      url: "/weather",
      headers: bearer(user.id),
    });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.location.lat).toBeCloseTo(40.7);
    expect(body.location.lng).toBeCloseTo(-74.0);
    expect(Array.isArray(body.minutely)).toBe(true);
    expect(body.minutely).toHaveLength(1);
    expect(mockFetch).toHaveBeenCalledWith(
      expect.closeTo(40.7),
      expect.closeTo(-74.0),
    );
  });

  it("returns 502 when the provider fails", async () => {
    const user = await makeUserWithLocation();
    mockFetch.mockRejectedValueOnce(new Error("upstream 503"));
    const res = await app.inject({
      method: "GET",
      url: "/weather",
      headers: bearer(user.id),
    });
    expect(res.statusCode).toBe(502);
  });
});
