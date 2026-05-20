// Integration tests for PUT /device/token.

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

describe("PUT /device/token", () => {
  it("returns 401 without a token", async () => {
    const res = await app.inject({
      method: "PUT",
      url: "/device/token",
      payload: { fcmToken: "abc" },
    });
    expect(res.statusCode).toBe(401);
  });

  it("stores the FCM token on the user row", async () => {
    const user = await prisma.user.create({
      data: { email: "dev@example.com", passwordHash: "x" },
    });
    const res = await app.inject({
      method: "PUT",
      url: "/device/token",
      headers: bearer(user.id),
      payload: { fcmToken: "fcm-token-xyz" },
    });
    expect(res.statusCode).toBe(204);

    const fresh = await prisma.user.findUnique({ where: { id: user.id } });
    expect(fresh!.fcmToken).toBe("fcm-token-xyz");
  });

  it("overwrites a previous token on rotation", async () => {
    const user = await prisma.user.create({
      data: {
        email: "rot@example.com",
        passwordHash: "x",
        fcmToken: "old-token",
      },
    });
    await app.inject({
      method: "PUT",
      url: "/device/token",
      headers: bearer(user.id),
      payload: { fcmToken: "new-token" },
    });
    const fresh = await prisma.user.findUnique({ where: { id: user.id } });
    expect(fresh!.fcmToken).toBe("new-token");
  });

  it("rejects an empty fcmToken with 400", async () => {
    const user = await prisma.user.create({
      data: { email: "empty@example.com", passwordHash: "x" },
    });
    const res = await app.inject({
      method: "PUT",
      url: "/device/token",
      headers: bearer(user.id),
      payload: { fcmToken: "" },
    });
    expect(res.statusCode).toBe(400);
  });
});
