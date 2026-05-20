// Integration tests for GET /preferences and PUT /preferences.

import { FastifyInstance } from "fastify";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { prisma } from "../db";
import { bearer, buildTestApp, resetDb } from "../test/helpers";

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
});

async function makeUserWithPrefs() {
  return prisma.user.create({
    data: {
      email: "prefs@example.com",
      passwordHash: "x",
      preferences: { create: {} },
    },
  });
}

describe("GET /preferences", () => {
  it("returns the user's default preferences row", async () => {
    const user = await makeUserWithPrefs();
    const res = await app.inject({
      method: "GET",
      url: "/preferences",
      headers: bearer(user.id),
    });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.alertLeadMin).toBe(10);
    expect(body.alertRain).toBe(true);
    expect(body.alertWind).toBe(false);
    expect(body.minRainIntensity).toBe("light");
  });

  it("returns 404 when the user has no preferences row", async () => {
    const user = await prisma.user.create({
      data: { email: "noprefs@example.com", passwordHash: "x" },
    });
    const res = await app.inject({
      method: "GET",
      url: "/preferences",
      headers: bearer(user.id),
    });
    expect(res.statusCode).toBe(404);
  });
});

describe("PUT /preferences", () => {
  it("updates only the supplied fields", async () => {
    const user = await makeUserWithPrefs();
    const res = await app.inject({
      method: "PUT",
      url: "/preferences",
      headers: bearer(user.id),
      payload: {
        alertLeadMin: 30,
        alertWind: true,
        minRainIntensity: "moderate",
      },
    });
    expect(res.statusCode).toBe(200);

    const row = await prisma.userPreferences.findUnique({
      where: { userId: user.id },
    });
    expect(row!.alertLeadMin).toBe(30);
    expect(row!.alertWind).toBe(true);
    expect(row!.minRainIntensity).toBe("moderate");
    // Untouched fields stay at the defaults.
    expect(row!.alertRain).toBe(true);
    expect(row!.alertSnow).toBe(true);
  });

  it("rejects an invalid intensity enum with 400", async () => {
    const user = await makeUserWithPrefs();
    const res = await app.inject({
      method: "PUT",
      url: "/preferences",
      headers: bearer(user.id),
      payload: { minRainIntensity: "torrential" },
    });
    expect(res.statusCode).toBe(400);
  });

  it("rejects an out-of-range lead time with 400", async () => {
    const user = await makeUserWithPrefs();
    const res = await app.inject({
      method: "PUT",
      url: "/preferences",
      headers: bearer(user.id),
      payload: { alertLeadMin: 500 },
    });
    expect(res.statusCode).toBe(400);
  });

  it("rejects unknown fields with 400 (additionalProperties:false)", async () => {
    const user = await makeUserWithPrefs();
    const res = await app.inject({
      method: "PUT",
      url: "/preferences",
      headers: bearer(user.id),
      payload: { hackerField: true },
    });
    expect(res.statusCode).toBe(400);
  });
});
