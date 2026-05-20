// Integration tests for /auth/register, /auth/login, /auth/refresh.
// Talks to a real Postgres (the docker-compose / CI service container) via
// Prisma; the rest of the stack (Fastify, bcrypt, JWT) is unmocked.

import { FastifyInstance } from "fastify";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { prisma } from "../db";
import { buildTestApp, resetDb } from "../test/helpers";
import { verifyAccessToken, verifyRefreshToken } from "../lib/tokens";

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

describe("POST /auth/register", () => {
  it("creates a user + default preferences and returns a token pair", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/auth/register",
      payload: { email: "Alice@example.com", password: "hunter2-long" },
    });

    expect(res.statusCode).toBe(201);
    const body = res.json();
    expect(typeof body.accessToken).toBe("string");
    expect(typeof body.refreshToken).toBe("string");

    // Email is lower-cased + trimmed.
    const user = await prisma.user.findUnique({
      where: { email: "alice@example.com" },
      include: { preferences: true },
    });
    expect(user).not.toBeNull();
    expect(user!.passwordHash).toBeTruthy();
    expect(user!.preferences).not.toBeNull();

    // Token sub is the new user's id.
    const payload = verifyAccessToken(body.accessToken);
    expect(payload.sub).toBe(user!.id);
  });

  it("rejects a duplicate email with 409", async () => {
    const payload = { email: "dup@example.com", password: "hunter2-long" };
    await app.inject({ method: "POST", url: "/auth/register", payload });
    const second = await app.inject({
      method: "POST",
      url: "/auth/register",
      payload,
    });
    expect(second.statusCode).toBe(409);
  });

  it("rejects an invalid body with 400", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/auth/register",
      payload: { email: "not-an-email", password: "short" },
    });
    expect(res.statusCode).toBe(400);
  });
});

describe("POST /auth/login", () => {
  const creds = { email: "login@example.com", password: "hunter2-long" };

  beforeEach(async () => {
    await app.inject({ method: "POST", url: "/auth/register", payload: creds });
  });

  it("returns a fresh token pair for valid credentials", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/auth/login",
      payload: creds,
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().accessToken).toBeTruthy();
  });

  it("rejects a wrong password with 401", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/auth/login",
      payload: { ...creds, password: "wrong-password" },
    });
    expect(res.statusCode).toBe(401);
  });

  it("rejects login for a social-only account (no password hash)", async () => {
    await prisma.user.create({
      data: {
        email: "social@example.com",
        passwordHash: null,
        provider: "apple",
        providerSub: "apple-sub-1",
        preferences: { create: {} },
      },
    });
    const res = await app.inject({
      method: "POST",
      url: "/auth/login",
      payload: { email: "social@example.com", password: "anything-long" },
    });
    expect(res.statusCode).toBe(401);
  });
});

describe("POST /auth/refresh", () => {
  it("exchanges a valid refresh token for a new pair", async () => {
    const reg = await app.inject({
      method: "POST",
      url: "/auth/register",
      payload: { email: "refresh@example.com", password: "hunter2-long" },
    });
    const { refreshToken } = reg.json();

    const res = await app.inject({
      method: "POST",
      url: "/auth/refresh",
      payload: { refreshToken },
    });
    expect(res.statusCode).toBe(200);
    const fresh = res.json();
    expect(fresh.accessToken).toBeTruthy();
    // New refresh token verifies under the refresh secret.
    expect(verifyRefreshToken(fresh.refreshToken).sub).toBe(
      verifyAccessToken(fresh.accessToken).sub,
    );
  });

  it("rejects garbage with 401", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/auth/refresh",
      payload: { refreshToken: "not-a-jwt" },
    });
    expect(res.statusCode).toBe(401);
  });
});
