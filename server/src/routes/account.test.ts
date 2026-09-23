// Integration tests for DELETE /account.

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

describe("DELETE /account", () => {
  it("returns 401 without a token", async () => {
    const res = await app.inject({ method: "DELETE", url: "/account" });
    expect(res.statusCode).toBe(401);
  });

  it("deletes the user and cascades to all related rows", async () => {
    // A user with a row in every child table + an FCM token on the user row.
    const user = await prisma.user.create({
      data: {
        email: "gone@example.com",
        passwordHash: "x",
        fcmToken: "fcm-token-xyz",
        preferences: { create: {} },
        location: { create: { lat: 64.14, lng: -21.94 } },
        subscription: { create: { status: "active" } },
        alertLogs: {
          create: {
            eventType: "rain",
            eventStartAt: new Date("2026-06-16T12:00:00Z"),
          },
        },
      },
    });

    const res = await app.inject({
      method: "DELETE",
      url: "/account",
      headers: bearer(user.id),
    });
    expect(res.statusCode).toBe(204);

    // The user row and every cascaded child row are gone.
    expect(await prisma.user.findUnique({ where: { id: user.id } })).toBeNull();
    expect(
      await prisma.userPreferences.findUnique({ where: { userId: user.id } }),
    ).toBeNull();
    expect(
      await prisma.userLocation.findUnique({ where: { userId: user.id } }),
    ).toBeNull();
    expect(
      await prisma.subscription.findUnique({ where: { userId: user.id } }),
    ).toBeNull();
    expect(await prisma.alertLog.count({ where: { userId: user.id } })).toBe(0);
  });

  it("invalidates the deleted user's tokens (user-not-found)", async () => {
    const user = await prisma.user.create({
      data: { email: "revoke@example.com", passwordHash: "x" },
    });
    const auth = bearer(user.id);

    await app.inject({ method: "DELETE", url: "/account", headers: auth });

    // The same access token no longer authenticates anywhere.
    const res = await app.inject({
      method: "DELETE",
      url: "/account",
      headers: auth,
    });
    expect(res.statusCode).toBe(401);
  });
});
