// Fastify application builder — extracted so tests can construct the app
// without `listen()` or the cron-driven alert engine. `src/index.ts` calls
// `buildServer` for the real boot path; tests call it via `app.inject()`.

import Fastify, { FastifyInstance } from "fastify";
import helmet from "@fastify/helmet";
import rateLimit from "@fastify/rate-limit";
import { config } from "./config";
import authPlugin from "./plugins/auth";
import authRoutes from "./routes/auth";
import socialRoutes from "./routes/social";
import locationRoutes from "./routes/location";
import weatherRoutes from "./routes/weather";
import preferencesRoutes from "./routes/preferences";
import deviceRoutes from "./routes/device";
import accountRoutes from "./routes/account";
import webhookRoutes from "./routes/webhooks";
import devRoutes from "./routes/dev";

/** A single rate-limit bucket, in the shape @fastify/rate-limit expects. */
export interface RateLimitBucket {
  max: number;
  timeWindow: string | number;
}

declare module "fastify" {
  interface FastifyInstance {
    /**
     * The tight bucket for credential endpoints. Routes opt in with
     * `config: { rateLimit: app.authRateLimit }` rather than hard-coding
     * numbers, so the limit stays configurable in one place.
     */
    authRateLimit: RateLimitBucket;
  }
}

export interface BuildServerOptions {
  /** Override the configured rate-limit buckets (used by tests). */
  rateLimit?: Partial<typeof config.rateLimit>;
}

export async function buildServer(
  options: BuildServerOptions = {},
): Promise<FastifyInstance> {
  const limits = { ...config.rateLimit, ...options.rateLimit };

  const app = Fastify({
    // Quiet during tests; production boot turns the logger back on.
    logger: config.env !== "test",
    bodyLimit: 1_048_576,
    // Behind Caddy, the socket address is the proxy's. Trusting
    // X-Forwarded-For makes `request.ip` — and therefore every rate-limit
    // bucket — key on the real client. Opt-in via TRUST_PROXY, because
    // trusting the header with no proxy in front lets a client spoof its IP.
    trustProxy: config.trustProxy,
    // Fastify's Ajv defaults to removeAdditional:true, which silently strips
    // unknown body fields. We want `additionalProperties:false` schemas to
    // *reject* unknown fields with a 400 instead (validate at the boundary).
    ajv: { customOptions: { removeAdditional: false } },
  });

  // Security headers. HSTS is left to Caddy, which terminates TLS and knows
  // whether the connection is actually HTTPS (see deploy/caddy/Caddyfile).
  await app.register(helmet, { hsts: false });

  // Global default bucket. Individual routes tighten it (auth) or opt out
  // (health) via their own `config.rateLimit`.
  await app.register(rateLimit, {
    max: limits.max,
    timeWindow: limits.timeWindow,
  });

  app.decorate("authRateLimit", {
    max: limits.authMax,
    timeWindow: limits.authTimeWindow,
  } satisfies RateLimitBucket);

  // Exempt from rate limiting: the process manager and uptime checks poll it.
  app.get("/health", { config: { rateLimit: false } }, async () => ({
    status: "ok",
  }));

  await app.register(authPlugin);
  await app.register(authRoutes);
  await app.register(socialRoutes);
  await app.register(locationRoutes);
  await app.register(weatherRoutes);
  await app.register(preferencesRoutes);
  await app.register(deviceRoutes);
  await app.register(accountRoutes);
  await app.register(webhookRoutes);

  // Dev routes need a positive opt-in (ENABLE_DEV_ROUTES=true), not just a
  // non-production NODE_ENV — a missing or misspelled NODE_ENV must not be
  // enough to expose POST /dev/seed-subscription in production.
  if (config.enableDevRoutes) {
    if (config.env === "production") {
      app.log.warn(
        "ENABLE_DEV_ROUTES=true in production — /dev routes are exposed",
      );
    }
    await app.register(devRoutes);
  }

  return app;
}
