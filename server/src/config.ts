// Centralised, validated environment configuration.
// Loaded once at startup; throws early if a required variable is missing.

import dotenv from "dotenv";

dotenv.config();

/** Read a required env var, or throw a clear error if it is absent. */
function required(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

/** Read an optional env var with a fallback default. */
function optional(name: string, fallback: string): string {
  return process.env[name] ?? fallback;
}

/** Read an optional boolean env var. Only the literal "true" enables it. */
function flag(name: string, fallback = false): boolean {
  const value = process.env[name];
  if (value === undefined) return fallback;
  return value.toLowerCase() === "true";
}

export const config = {
  env: optional("NODE_ENV", "development"),
  port: Number(optional("PORT", "3000")),

  // Trust X-Forwarded-For so `request.ip` is the real client address when we
  // sit behind the Caddy reverse proxy (spec §7). Rate limiting keys on that
  // IP, so leaving this off in production would bucket every request under
  // the proxy's address. Off by default: trusting the header when nothing
  // strips it would let a client spoof its own IP.
  trustProxy: flag("TRUST_PROXY"),

  // Dev-only routes fail *closed*: they need a positive opt-in, not merely a
  // non-production NODE_ENV. A missing or misspelled NODE_ENV would otherwise
  // expose POST /dev/seed-subscription, letting any authenticated user grant
  // themselves a subscription.
  enableDevRoutes: flag("ENABLE_DEV_ROUTES"),

  jwt: {
    accessSecret: required("JWT_ACCESS_SECRET"),
    refreshSecret: required("JWT_REFRESH_SECRET"),
    accessTtl: optional("JWT_ACCESS_TTL", "15m"),
    refreshTtl: optional("JWT_REFRESH_TTL", "30d"),
  },

  databaseUrl: required("DATABASE_URL"),

  tomorrow: {
    apiKey: required("TOMORROW_API_KEY"),
    baseUrl: optional("TOMORROW_BASE_URL", "https://api.tomorrow.io/v4"),
    // Abort a forecast request that hangs, so it can't stall an alert cycle.
    timeoutMs: Number(optional("TOMORROW_TIMEOUT_MS", "10000")),
  },

  forecast: {
    // How long a grid cell's forecast stays usable, across alert cycles and
    // in-app /weather requests. This is the main lever on Tomorrow.io spend:
    // calls/day/cell ≈ 1440 / (ttlMs / 60000), independent of cron cadence.
    // Raising it cuts cost and shortens the usable lookahead by the same
    // amount; keep it well under the ~60-minute forecast horizon.
    cacheTtlMs: Number(optional("FORECAST_CACHE_TTL_MS", "600000")),
    // Ceiling on cached cells, so a large or scattered user base can't grow
    // the map without bound between prunes.
    cacheMaxEntries: Number(optional("FORECAST_CACHE_MAX_ENTRIES", "500")),
  },

  rateLimit: {
    // Global default bucket, applied to every route.
    max: Number(optional("RATE_LIMIT_MAX", "120")),
    timeWindow: optional("RATE_LIMIT_WINDOW", "1 minute"),
    // Tighter bucket for /auth/* — these are the credential-stuffing,
    // brute-force and email-enumeration surface.
    authMax: Number(optional("RATE_LIMIT_AUTH_MAX", "10")),
    authTimeWindow: optional("RATE_LIMIT_AUTH_WINDOW", "1 minute"),
  },

  revenueCat: {
    webhookSecret: required("REVENUECAT_WEBHOOK_SECRET"),
  },

  // Optional: only needed if social sign-in is enabled. The /auth/apple and
  // /auth/google routes return 501 when their value here is empty.
  social: {
    // Apple identity tokens carry the app's bundle id as the `aud` claim.
    appleClientId: process.env.APPLE_CLIENT_ID ?? "",
    // Comma-separated list of accepted Google OAuth client IDs (audiences).
    googleClientIds: (process.env.GOOGLE_CLIENT_IDS ?? "")
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean),
  },

  alertEngine: {
    // Paid tier: poll cadence for active/trial subscribers (minute-precise).
    cron: optional("ALERT_ENGINE_CRON", "*/5 * * * *"),
    // Free tier: hourly poll for everyone else (rain within the next hour).
    freeCron: optional("ALERT_ENGINE_FREE_CRON", "0 * * * *"),
    locationStaleMinutes: Number(optional("LOCATION_STALE_MINUTES", "30")),
  },
} as const;

export type Config = typeof config;
