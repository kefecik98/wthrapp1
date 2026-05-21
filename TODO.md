# WeatherAlert — TODO

Living tracker. Check items off when done; add new items as they surface.
Legend: `[ ]` open · `[x]` done · `(BLOCKED)` needs env/credentials I can't
provide here · `(DECISION)` needs a product decision from K.

## Actionable now (code)

_All code-actionable items are done. Remaining work needs the
environment, credentials, or product decisions below._

## Blocked — needs environment / credentials

- [ ] (BLOCKED) Provision PostgreSQL + apply migrations (no Docker here)
- [ ] (BLOCKED) Real secrets in server/.env and client/.env
- [ ] (BLOCKED) Run both apps on device/simulator — runtime unverified
- [ ] (BLOCKED) Google OAuth client IDs (EXPO_PUBLIC_GOOGLE_* + GOOGLE_CLIENT_IDS)
- [ ] (BLOCKED) APPLE_CLIENT_ID = app bundle id
- [ ] (BLOCKED) Deployment: Nginx + PM2 + Certbot on the rack (spec §7)

## Needs a decision

- [ ] (DECISION) Tomorrow.io plan/tier — from a call-volume estimate (spec §8.1)
- [ ] (DECISION) Free-tier definition — limited-free vs subscription-only (§8.4)

## Done

- [x] Server unit tests — vitest + 8 tests for weather threshold logic
- [x] FCM token rotation — addPushTokenListener re-syncs token (Providers)
- [x] Push handler + deep-link — foreground handler + tap routes to
      app/forecast.tsx (incl. cold-start)
- [x] iOS location copy + app identity (WeatherAlert/bundle id) +
      location/notification/Apple plugins in app.json
- [x] Provider-sub mapping — users.provider/provider_sub + migration;
      social routes resolve by (provider,sub), email-link fallback
- [x] RevenueCat scaffold — purchases service, useSubscription,
      app/paywall.tsx, SDK keyed to user id; needs RC keys to run
- [x] CI workflow (.github/workflows/ci.yml) — server typecheck+tests,
      client typecheck+lint; verified locally
