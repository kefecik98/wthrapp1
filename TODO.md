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
- [ ] (BLOCKED) Run both apps on device/simulator — runtime unverified.
      Requires a custom dev client (EAS Build or `expo prebuild` + native
      build); Expo Go cannot load background-location, FCM, Apple Sign-In,
      or RevenueCat native modules.
- [ ] (BLOCKED) Tomorrow.io API key (`TOMORROW_API_KEY`) — free tier is
      enough to validate the alert engine end-to-end
- [ ] (BLOCKED) Firebase project + service-account JSON
      (`GOOGLE_APPLICATION_CREDENTIALS`) — required for any FCM push
      delivery from the server
- [ ] (BLOCKED) Firebase client config files —
      `client/GoogleService-Info.plist` (iOS) and
      `client/google-services.json` (Android), from the same Firebase
      project as the server's service account
- [ ] (BLOCKED) APNs auth key uploaded to Firebase so iOS push routes
      through APNs (requires Apple Developer Program)
- [ ] (BLOCKED) Apple Developer Program enrolment ($99/yr) — needed to
      sign builds for `com.weatheralert.app` and enable Sign in with
      Apple, Push Notifications, and Background Modes capabilities
- [ ] (BLOCKED) Google Play Console enrolment ($25 one-time)
- [ ] (BLOCKED) Google OAuth client IDs (EXPO_PUBLIC_GOOGLE_* + GOOGLE_CLIENT_IDS)
- [ ] (BLOCKED) APPLE_CLIENT_ID = app bundle id
- [ ] (BLOCKED) RevenueCat dashboard set-up: public SDK keys
      (`EXPO_PUBLIC_REVENUECAT_IOS_KEY` / `_ANDROID_KEY`) and webhook
      shared secret (`REVENUECAT_WEBHOOK_SECRET`)
- [ ] (BLOCKED) Deployment: Nginx + PM2 + Certbot on the rack (spec §7)
- [ ] (BLOCKED) Domain + DNS (or DDNS via DuckDNS / Cloudflare) pointing
      at the rack's public IP, with 443 forwarded through the router
- [ ] (BLOCKED) PM2 ecosystem file / systemd unit + log rotation for the
      Node process (not in repo)
- [ ] (BLOCKED) Postgres backup strategy on the rack (`pg_dump` cron at
      minimum, shipped off-box)

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
