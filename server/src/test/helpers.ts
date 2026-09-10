// Shared helpers for the route + engine integration tests.
//
// Build the same Fastify app the production boot uses, but drive it via
// `app.inject()` instead of binding a TCP port. Each test file resets the
// DB to a known empty state — we run vitest with `fileParallelism: false`
// so the shared database is safe.

import { FastifyInstance } from "fastify";
import { buildServer } from "../app";
import { prisma } from "../db";
import { signTokenPair, TokenPair } from "../lib/tokens";

/** Boot a Fastify instance suitable for `inject()`. */
export async function buildTestApp(): Promise<FastifyInstance> {
  const app = await buildServer();
  await app.ready();
  return app;
}

/**
 * Truncate every application table. Restarts identities and cascades
 * through FK relations so the per-test starting state is deterministic.
 */
export async function resetDb(): Promise<void> {
  await prisma.$executeRawUnsafe(
    'TRUNCATE TABLE "alert_log", "user_preferences", "user_locations", "subscriptions", "users" RESTART IDENTITY CASCADE',
  );
}

/**
 * Sign a real token pair for an existing user id. Uses tokenVersion 0, which
 * matches the default for freshly created users; tests that need a non-zero
 * version sign their own tokens via `signTokenPair`.
 */
export function tokensFor(userId: string): TokenPair {
  return signTokenPair(userId, 0);
}

/** Convenience: a Bearer Authorization header for `userId`. */
export function bearer(userId: string): { authorization: string } {
  return { authorization: `Bearer ${tokensFor(userId).accessToken}` };
}
