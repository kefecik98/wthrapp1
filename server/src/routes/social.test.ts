// Integration tests for /auth/apple and /auth/google. The provider
// verifiers are mocked so tests don't hit Apple's JWKS or Google's
// auth library; the rest of the stack (Fastify, Prisma) is real.

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

// Hoisted mocks — must be set up before the modules that import them.
vi.mock("../services/appleAuth", () => ({
  verifyAppleToken: vi.fn(),
}));
vi.mock("../services/googleAuth", () => ({
  verifyGoogleToken: vi.fn(),
}));

import { prisma } from "../db";
import { buildTestApp, resetDb } from "../test/helpers";
import { verifyAppleToken } from "../services/appleAuth";
import { verifyGoogleToken } from "../services/googleAuth";
import { verifyAccessToken } from "../lib/tokens";

const mockApple = vi.mocked(verifyAppleToken);
const mockGoogle = vi.mocked(verifyGoogleToken);

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
  mockApple.mockReset();
  mockGoogle.mockReset();
});

describe("POST /auth/apple", () => {
  it("creates a new social user when no account matches", async () => {
    mockApple.mockResolvedValueOnce({
      sub: "apple-sub-new",
      email: "new@privaterelay.appleid.com",
    });

    const res = await app.inject({
      method: "POST",
      url: "/auth/apple",
      payload: { idToken: "apple-id-token" },
    });

    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.accessToken).toBeTruthy();

    const user = await prisma.user.findFirst({
      where: { provider: "apple", providerSub: "apple-sub-new" },
      include: { preferences: true },
    });
    expect(user).not.toBeNull();
    expect(user!.passwordHash).toBeNull();
    expect(user!.preferences).not.toBeNull();
    expect(verifyAccessToken(body.accessToken).sub).toBe(user!.id);
  });

  it("matches an existing account by (provider, sub) regardless of email", async () => {
    const existing = await prisma.user.create({
      data: {
        email: "old-email@example.com",
        provider: "apple",
        providerSub: "apple-sub-existing",
        preferences: { create: {} },
      },
    });

    mockApple.mockResolvedValueOnce({
      sub: "apple-sub-existing",
      email: undefined, // private relay: provider may withhold email on re-auth
    });

    const res = await app.inject({
      method: "POST",
      url: "/auth/apple",
      payload: { idToken: "apple-id-token" },
    });

    expect(res.statusCode).toBe(200);
    expect(verifyAccessToken(res.json().accessToken).sub).toBe(existing.id);
    // No new user was created.
    expect(await prisma.user.count()).toBe(1);
  });

  it("links an existing password account when the provider supplies a matching email", async () => {
    const existing = await prisma.user.create({
      data: {
        email: "link@example.com",
        passwordHash: "x", // pre-existing password account
        preferences: { create: {} },
      },
    });

    mockApple.mockResolvedValueOnce({
      sub: "apple-sub-link",
      email: "link@example.com",
    });

    const res = await app.inject({
      method: "POST",
      url: "/auth/apple",
      payload: { idToken: "apple-id-token" },
    });

    expect(res.statusCode).toBe(200);
    const updated = await prisma.user.findUnique({ where: { id: existing.id } });
    expect(updated!.provider).toBe("apple");
    expect(updated!.providerSub).toBe("apple-sub-link");
  });

  it("returns 400 when a brand-new account would be needed but no email was supplied", async () => {
    mockApple.mockResolvedValueOnce({ sub: "no-email-sub" });

    const res = await app.inject({
      method: "POST",
      url: "/auth/apple",
      payload: { idToken: "apple-id-token" },
    });
    expect(res.statusCode).toBe(400);
  });

  it("returns 501 when the verifier reports the provider is not configured", async () => {
    mockApple.mockRejectedValueOnce(new Error("Apple sign-in is not configured"));
    const res = await app.inject({
      method: "POST",
      url: "/auth/apple",
      payload: { idToken: "apple-id-token" },
    });
    expect(res.statusCode).toBe(501);
  });

  it("returns 401 for an invalid token", async () => {
    mockApple.mockRejectedValueOnce(new Error("Invalid Apple token"));
    const res = await app.inject({
      method: "POST",
      url: "/auth/apple",
      payload: { idToken: "bad" },
    });
    expect(res.statusCode).toBe(401);
  });
});

describe("POST /auth/google", () => {
  it("creates a new social user", async () => {
    mockGoogle.mockResolvedValueOnce({
      sub: "google-sub-new",
      email: "g@example.com",
    });

    const res = await app.inject({
      method: "POST",
      url: "/auth/google",
      payload: { idToken: "google-id-token" },
    });

    expect(res.statusCode).toBe(200);
    const user = await prisma.user.findFirst({
      where: { provider: "google", providerSub: "google-sub-new" },
    });
    expect(user).not.toBeNull();
  });
});
