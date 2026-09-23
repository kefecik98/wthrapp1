// Integration tests for the cross-cutting hardening in app.ts and lib/tokens:
// rate limiting, security headers, the dev-route gate, and JWT algorithm
// pinning. Behaviour here is easy to regress silently, so it gets its own file.

import { FastifyInstance } from "fastify";
import jwt from "jsonwebtoken";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

import { prisma } from "../db";
import { config } from "../config";
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

describe("dev routes", () => {
  it("are not registered without ENABLE_DEV_ROUTES=true", async () => {
    // The test env sets no ENABLE_DEV_ROUTES, so the route must not exist —
    // a non-production NODE_ENV alone must not be enough to expose it.
    expect(config.enableDevRoutes).toBe(false);

    const user = await prisma.user.create({
      data: { email: "dev@example.com", passwordHash: "x" },
    });
    const res = await app.inject({
      method: "POST",
      url: "/dev/seed-subscription",
      headers: bearer(user.id),
      payload: { status: "active" },
    });
    expect(res.statusCode).toBe(404);
    expect(await prisma.subscription.count()).toBe(0);
  });
});

describe("security headers", () => {
  it("sets helmet's headers on responses", async () => {
    const res = await app.inject({ method: "GET", url: "/health" });
    expect(res.statusCode).toBe(200);
    expect(res.headers["x-content-type-options"]).toBe("nosniff");
    expect(res.headers["x-frame-options"]).toBeDefined();
    // HSTS is Caddy's job — it terminates TLS and knows the scheme.
    expect(res.headers["strict-transport-security"]).toBeUndefined();
  });
});

describe("JWT algorithm pinning", () => {
  it("rejects an access token signed with alg=none", async () => {
    const user = await prisma.user.create({
      data: { email: "none@example.com", passwordHash: "x" },
    });
    const forged = jwt.sign({ sub: user.id, tv: 0 }, "", {
      algorithm: "none",
    });
    const res = await app.inject({
      method: "GET",
      url: "/preferences",
      headers: { authorization: `Bearer ${forged}` },
    });
    expect(res.statusCode).toBe(401);
  });

  it("still accepts a properly signed HS256 token", async () => {
    const user = await prisma.user.create({
      data: {
        email: "hs256@example.com",
        passwordHash: "x",
        preferences: { create: {} },
      },
    });
    const res = await app.inject({
      method: "GET",
      url: "/preferences",
      headers: bearer(user.id),
    });
    expect(res.statusCode).toBe(200);
  });
});

describe("password length cap", () => {
  it("rejects a password longer than 128 characters", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/auth/register",
      payload: { email: "long@example.com", password: "a".repeat(129) },
    });
    expect(res.statusCode).toBe(400);
    expect(await prisma.user.count()).toBe(0);
  });

  it("accepts a password at the 128-character limit", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/auth/register",
      payload: { email: "ok@example.com", password: "a".repeat(128) },
    });
    expect(res.statusCode).toBe(201);
  });
});

describe("rate limiting", () => {
  // A separate app: the shared one lifts the limits so ordinary tests aren't
  // throttled (every injected request shares one synthetic IP).
  let limited: FastifyInstance;

  beforeAll(async () => {
    limited = await buildTestApp({
      rateLimit: { max: 1000, authMax: 3, authTimeWindow: "1 minute" },
    });
  });

  afterAll(async () => {
    await limited.close();
  });

  it("throttles /auth/login past the tight auth bucket", async () => {
    const attempt = () =>
      limited.inject({
        method: "POST",
        url: "/auth/login",
        payload: { email: "nobody@example.com", password: "wrong-password" },
      });

    // The bucket is 3/minute: the first three get a normal 401, the fourth
    // is refused outright.
    for (let i = 0; i < 3; i++) {
      expect((await attempt()).statusCode).toBe(401);
    }
    const blocked = await attempt();
    expect(blocked.statusCode).toBe(429);
    expect(blocked.headers["retry-after"]).toBeDefined();
  });

  it("leaves /health unthrottled so uptime checks aren't blocked", async () => {
    for (let i = 0; i < 20; i++) {
      const res = await limited.inject({ method: "GET", url: "/health" });
      expect(res.statusCode).toBe(200);
    }
  });
});
