import { readFileSync } from "node:fs";
import { defineConfig } from "vitest/config";
import dotenv from "dotenv";

// Load the local .env so `npm test` picks up DATABASE_URL (and friends)
// without needing them exported in the shell. A missing .env (CI, fresh
// checkout) is fine — CI sets these via real process.env, which still wins
// in the `process.env ?? fileEnv ?? fallback` chain below.
let fileEnv: Record<string, string> = {};
try {
  fileEnv = dotenv.parse(readFileSync(new URL("./.env", import.meta.url)));
} catch {
  // no .env present — fall through to process.env + dummy defaults
}

// Dummy fallback values so config.ts (loaded transitively by modules under
// test) passes its required-env validation when nothing else supplies them.
// Precedence: real shell env > .env file > dummy default.
export default defineConfig({
  test: {
    env: {
      // Pinned, not inherited: a developer with ENABLE_DEV_ROUTES=true in
      // their local .env must still see the production-shaped app under test,
      // or security.test.ts's "dev routes are off" assertion is meaningless.
      ENABLE_DEV_ROUTES: "false",
      JWT_ACCESS_SECRET:
        process.env.JWT_ACCESS_SECRET ?? fileEnv.JWT_ACCESS_SECRET ?? "test-access",
      JWT_REFRESH_SECRET:
        process.env.JWT_REFRESH_SECRET ?? fileEnv.JWT_REFRESH_SECRET ?? "test-refresh",
      DATABASE_URL:
        process.env.DATABASE_URL ??
        fileEnv.DATABASE_URL ??
        "postgresql://test:test@localhost:5432/test",
      TOMORROW_API_KEY:
        process.env.TOMORROW_API_KEY ?? fileEnv.TOMORROW_API_KEY ?? "test",
      // Pinned like ENABLE_DEV_ROUTES: tests must never reach a real
      // instance, even if a developer's .env points at one on the LAN.
      WEATHER_PROVIDER: "tomorrow",
      PIRATE_WEATHER_BASE_URL: "http://pirate-weather.test:8083",
      PIRATE_WEATHER_API_KEY: "test",
      REVENUECAT_WEBHOOK_SECRET:
        process.env.REVENUECAT_WEBHOOK_SECRET ??
        fileEnv.REVENUECAT_WEBHOOK_SECRET ??
        "test",
      APPLE_CLIENT_ID:
        process.env.APPLE_CLIENT_ID ?? fileEnv.APPLE_CLIENT_ID ?? "com.weatheralert.app",
      GOOGLE_CLIENT_IDS:
        process.env.GOOGLE_CLIENT_IDS ??
        fileEnv.GOOGLE_CLIENT_IDS ??
        "test-google-client-id",
    },
    // Integration tests share a DB; run files serially to avoid races. The
    // pure-logic weather test doesn't care either way.
    fileParallelism: false,
  },
});
