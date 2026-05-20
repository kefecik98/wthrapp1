import { defineConfig } from "vitest/config";

// Dummy fallback values so config.ts (loaded transitively by modules under
// test) passes its required-env validation when the test runner has no real
// env set. CI overrides these with real values (a real DATABASE_URL pointing
// at the postgres service container) — `process.env ?? fallback` keeps those.
export default defineConfig({
  test: {
    env: {
      JWT_ACCESS_SECRET: process.env.JWT_ACCESS_SECRET ?? "test-access",
      JWT_REFRESH_SECRET: process.env.JWT_REFRESH_SECRET ?? "test-refresh",
      DATABASE_URL:
        process.env.DATABASE_URL ??
        "postgresql://test:test@localhost:5432/test",
      TOMORROW_API_KEY: process.env.TOMORROW_API_KEY ?? "test",
      REVENUECAT_WEBHOOK_SECRET:
        process.env.REVENUECAT_WEBHOOK_SECRET ?? "test",
      APPLE_CLIENT_ID: process.env.APPLE_CLIENT_ID ?? "com.weatheralert.app",
      GOOGLE_CLIENT_IDS:
        process.env.GOOGLE_CLIENT_IDS ?? "test-google-client-id",
    },
    // Integration tests share a DB; run files serially to avoid races. The
    // pure-logic weather test doesn't care either way.
    fileParallelism: false,
  },
});
