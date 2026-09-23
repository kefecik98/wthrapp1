// Integration tests for PUT /location.

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

async function makeUser(email = "loc@example.com") {
  return prisma.user.create({
    data: { email, passwordHash: "x", preferences: { create: {} } },
  });
}

describe("PUT /location", () => {
  it("rejects unauthenticated requests with 401", async () => {
    const res = await app.inject({
      method: "PUT",
      url: "/location",
      payload: { lat: 40.0, lng: -73.0 },
    });
    expect(res.statusCode).toBe(401);
  });

  it("creates the user_locations row on first call", async () => {
    const user = await makeUser();
    const res = await app.inject({
      method: "PUT",
      url: "/location",
      headers: bearer(user.id),
      payload: { lat: 40.695, lng: -73.995 }, // already a 0.03° cell centre
    });
    expect(res.statusCode).toBe(204);

    const row = await prisma.userLocation.findUnique({
      where: { userId: user.id },
    });
    expect(row).not.toBeNull();
    expect(row!.lat).toBe(40.695);
    expect(row!.lng).toBe(-73.995);
  });

  it("never stores an exact position — snaps to the location grid", async () => {
    // An old app build (or anything else) sending a precise GPS fix.
    const user = await makeUser();
    await app.inject({
      method: "PUT",
      url: "/location",
      headers: bearer(user.id),
      payload: { lat: 47.6062, lng: -122.3321, accuracy: 4.2 },
    });

    const row = await prisma.userLocation.findUnique({
      where: { userId: user.id },
    });
    expect(row!.lat).toBe(47.595);
    expect(row!.lng).toBe(-122.325);
    // Accuracy describes the exact fix, so it isn't kept either.
    expect(row!.accuracyM).toBeNull();
  });

  it("upserts on subsequent calls (one row per user)", async () => {
    const user = await makeUser();
    await app.inject({
      method: "PUT",
      url: "/location",
      headers: bearer(user.id),
      payload: { lat: 40.7, lng: -74.0 },
    });
    await app.inject({
      method: "PUT",
      url: "/location",
      headers: bearer(user.id),
      payload: { lat: 41.0, lng: -75.0 },
    });
    expect(await prisma.userLocation.count({ where: { userId: user.id } })).toBe(1);
    const row = await prisma.userLocation.findUnique({
      where: { userId: user.id },
    });
    expect(row!.lat).toBeCloseTo(41.0, 1);
  });

  it("rejects out-of-range coordinates with 400", async () => {
    const user = await makeUser();
    const res = await app.inject({
      method: "PUT",
      url: "/location",
      headers: bearer(user.id),
      payload: { lat: 100, lng: 0 },
    });
    expect(res.statusCode).toBe(400);
  });
});
