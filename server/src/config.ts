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

export const config = {
  env: optional("NODE_ENV", "development"),
  port: Number(optional("PORT", "3000")),

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
    cron: optional("ALERT_ENGINE_CRON", "*/2 * * * *"),
    locationStaleMinutes: Number(optional("LOCATION_STALE_MINUTES", "30")),
  },
} as const;

export type Config = typeof config;
