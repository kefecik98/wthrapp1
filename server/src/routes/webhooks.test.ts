// Integration tests for POST /webhooks/revenuecat.
//
// Auth model: the route compares the raw Authorization header against
// `config.revenueCat.webhookSecret` using timingSafeEqual. There is no
// HMAC — RevenueCat's documented webhook auth is a static shared secret.

import { FastifyInstance } from "fastify";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { prisma } from "../db";
import { buildTestApp, resetDb } from "../test/helpers";
import { config } from "../config";

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

const SECRET = config.revenueCat.webhookSecret;

function event(
  type: string,
  appUserId: string,
  extra: Record<string, unknown> = {},
) {
  return { event: { type, app_user_id: appUserId, ...extra } };
}

describe("POST /webhooks/revenuecat", () => {
  it("rejects a missing Authorization header with 401", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/webhooks/revenuecat",
      payload: event("INITIAL_PURCHASE", "anything"),
    });
    expect(res.statusCode).toBe(401);
  });

  it("rejects a wrong secret with 401", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/webhooks/revenuecat",
      headers: { authorization: "not-the-secret" },
      payload: event("INITIAL_PURCHASE", "anything"),
    });
    expect(res.statusCode).toBe(401);
  });

  it("rejects a malformed body with 400", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/webhooks/revenuecat",
      headers: { authorization: SECRET },
      payload: { event: { type: "INITIAL_PURCHASE" } }, // missing app_user_id
    });
    expect(res.statusCode).toBe(400);
  });

  it("acknowledges unknown event types with 204 (no DB write)", async () => {
    const user = await prisma.user.create({
      data: { email: "wh@example.com", passwordHash: "x" },
    });
    const res = await app.inject({
      method: "POST",
      url: "/webhooks/revenuecat",
      headers: { authorization: SECRET },
      payload: event("BILLING_ISSUE", user.id),
    });
    expect(res.statusCode).toBe(204);
    expect(await prisma.subscription.count()).toBe(0);
  });

  it("creates an active subscription on INITIAL_PURCHASE", async () => {
    const user = await prisma.user.create({
      data: { email: "wh2@example.com", passwordHash: "x" },
    });
    const expiresMs = Date.now() + 30 * 86_400_000;
    const res = await app.inject({
      method: "POST",
      url: "/webhooks/revenuecat",
      headers: { authorization: SECRET },
      payload: event("INITIAL_PURCHASE", user.id, {
        product_id: "monthly",
        expiration_at_ms: expiresMs,
      }),
    });
    expect(res.statusCode).toBe(204);

    const sub = await prisma.subscription.findUnique({
      where: { userId: user.id },
    });
    expect(sub).not.toBeNull();
    expect(sub!.status).toBe("active");
    expect(sub!.plan).toBe("monthly");
    expect(sub!.expiresAt?.getTime()).toBe(expiresMs);
    expect(sub!.revenuecatUserId).toBe(user.id);
  });

  it("upserts on subsequent events (status transitions to cancelled)", async () => {
    const user = await prisma.user.create({
      data: { email: "wh3@example.com", passwordHash: "x" },
    });
    await app.inject({
      method: "POST",
      url: "/webhooks/revenuecat",
      headers: { authorization: SECRET },
      payload: event("INITIAL_PURCHASE", user.id, { product_id: "monthly" }),
    });
    await app.inject({
      method: "POST",
      url: "/webhooks/revenuecat",
      headers: { authorization: SECRET },
      payload: event("CANCELLATION", user.id),
    });
    const sub = await prisma.subscription.findUnique({
      where: { userId: user.id },
    });
    expect(sub!.status).toBe("cancelled");
    expect(await prisma.subscription.count({ where: { userId: user.id } })).toBe(1);
  });

  it("maps TRIAL -> trial and EXPIRATION -> expired", async () => {
    const user = await prisma.user.create({
      data: { email: "wh4@example.com", passwordHash: "x" },
    });
    await app.inject({
      method: "POST",
      url: "/webhooks/revenuecat",
      headers: { authorization: SECRET },
      payload: event("TRIAL", user.id),
    });
    expect(
      (await prisma.subscription.findUnique({ where: { userId: user.id } }))!
        .status,
    ).toBe("trial");

    await app.inject({
      method: "POST",
      url: "/webhooks/revenuecat",
      headers: { authorization: SECRET },
      payload: event("EXPIRATION", user.id),
    });
    expect(
      (await prisma.subscription.findUnique({ where: { userId: user.id } }))!
        .status,
    ).toBe("expired");
  });
});
