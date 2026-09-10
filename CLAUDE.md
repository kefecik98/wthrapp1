# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Identity

You are helping K build **WeatherAlert** — a React Native + Expo client and a Fastify + Postgres server that sends hyperlocal push notifications before weather events reach the user's GPS location.

## Rules

- Write in plain, clear language
- Ask clarifying questions before making assumptions
- When you are unsure, say so
- The full product spec is `weather-app-spec.md` — treat it as the source of truth for behaviour
- `server/CLAUDE.md` and `client/CLAUDE.md` add directory-specific guidance; read them when working in either. Each also has a `CONTEXT.md` with a deeper stack/directory map and code conventions — useful for orientation, but the code and this file win on any conflict.

## Repository layout

Monorepo with two independent npm projects:

- `server/` — Node.js 22 + Fastify 5 + Prisma 6 + PostgreSQL. REST API plus an in-process `node-cron` alert engine.
- `client/` — React Native + Expo (SDK 54) + expo-router, TypeScript, single codebase that must compile and run on iOS and Android.
- `server/deploy/` — production deploy runbook (`DEPLOY.md`) + PM2 ecosystem + Nginx config for the Proxmox rack target (spec §7). `server/Dockerfile` is a fallback containerized path.
- `weather-app-spec.md` — authoritative product/architecture spec (detailed; ~400 lines).
- `CONTEXT.md` (repo root) — condensed orientation: product summary, tech stack, plus "What good looks like" / "What to avoid" guidance not in the spec.
- `TODO.md` — living tracker of open work, blocked items (env/credentials), and pending product decisions.
- `ACCOUNTS.md` — external accounts/credentials map: which service each env var consumes, signup cost, and free-tier limits.
- `.github/workflows/ci.yml` — CI runs server typecheck + tests (against a real Postgres service) and client typecheck + lint + jest on push/PR. CI also enforces Prisma migration drift via `prisma migrate diff --exit-code`, so any `schema.prisma` change requires a committed migration alongside it.
- `server/trigger_cycle.ts` + `server/retry_push.sh` — ad-hoc scripts for manually firing an alert cycle / re-sending an FCM push during debugging; not part of the running app.

There is no root `package.json`; run commands inside `server/` or `client/`.

## Common commands

Server (`cd server`):

| Task                  | Command                       |
|-----------------------|-------------------------------|
| Install               | `npm install`                 |
| Dev (watch)           | `npm run dev`                 |
| Typecheck             | `npm run typecheck`           |
| All tests             | `npm test`                    |
| Watch tests           | `npm run test:watch`          |
| Single test file      | `npx vitest run src/services/weather.test.ts` |
| Build                 | `npm run build`               |
| Start built           | `npm start`                   |
| Generate Prisma client| `npm run prisma:generate`     |
| Apply migrations (dev)| `npm run prisma:migrate`      |
| Local Postgres        | `docker compose up -d`        |

`npm test` runs integration tests that require a reachable Postgres (`DATABASE_URL`) with migrations applied — run `docker compose up -d && npx prisma migrate deploy` first. Tests run serially (`fileParallelism: false` in `vitest.config.ts`) because they share the DB via `src/test/helpers.ts`'s `resetDb()`.

Client (`cd client`):

| Task             | Command                                            |
|------------------|----------------------------------------------------|
| Install          | `npm install`                                      |
| Start Metro      | `npm start` (or `npx expo start`)                  |
| iOS              | `npm run ios`                                      |
| Android          | `npm run android`                                  |
| Web              | `npm run web`                                      |
| Typecheck        | `npm run typecheck`                                |
| Lint             | `npm run lint`                                     |
| Test (jest)      | `npm test`                                         |
| Single test file | `npx jest src/__tests__/screens/login.test.tsx`    |

Both projects require Node 22 and have `.env.example` files that must be copied to `.env` before running.

## Architecture — the big picture

The client and server cooperate to deliver one thing: a push notification fired *before* a weather event reaches the user's GPS location.

1. **Client** (`client/`) reports GPS via `expo-location` (foreground poll + background significant-change task in `src/services/location.ts`) to `PUT /location`, and registers its FCM push token via `PUT /device/token`. Auth is JWT access + refresh, persisted to `expo-secure-store`; the `Authorization: Bearer ...` header is added by the `src/lib/api.ts` fetch wrapper, which also retries once on 401 by hitting `POST /auth/refresh`. Server data is fetched through `@tanstack/react-query`; session state lives in a Zustand store. Routing is `expo-router` with an auth gate in `app/_layout.tsx` (Stack.Protected → tabs vs. login).

2. **Server** (`server/`) is a single Fastify process. Routes under `src/routes/` cover auth (email/password + Apple + Google), location, weather, preferences, device token, the RevenueCat webhook, and dev-only seed routes. The same process runs the alert engine via `node-cron` (`src/engine/alertEngine.ts`).

3. **Alert engine** (spec §6.3) every ~2 minutes:
   - selects users that are subscribed (`active`/`trial`), have notifications on, a fresh location, and an FCM token,
   - clusters them into ~0.1° lat/lng grid cells so it makes one Tomorrow.io call per cell instead of per user,
   - runs `findNextEvent` (in `src/services/weather.ts`) against each user's enabled event types + intensity thresholds + lead time,
   - dedupes by inserting into `alert_log` — the `UNIQUE (user_id, event_type, event_start_at)` constraint *is* the dedup; a duplicate insert throws and the alert is silently skipped,
   - sends the FCM push via `src/services/push.ts`.

   Resilience invariants (keep these intact): a slow tick can't pile up — `startAlertEngine` skips a cron tick if the previous cycle is still running (direct callers like tests are intentionally unguarded). Both external calls are time-bounded so one hang can't stall a cycle: the Tomorrow.io fetch via `config.tomorrow.timeoutMs` (`TOMORROW_TIMEOUT_MS`), and each FCM send via an internal 10s cap in `push.ts`.

4. **Social auth**: Apple and Google identity tokens are verified server-side (`src/services/appleAuth.ts` via JWKS, `src/services/googleAuth.ts` via `google-auth-library`). Accounts resolve by the stable `(provider, provider_sub)` key with an email-link fallback, so Apple private-relay addresses are handled. `users.password_hash` is nullable for social-only accounts.

5. **Subscriptions**: client uses RevenueCat SDK (`client/src/services/purchases.ts`, keyed to the JWT-decoded user id). Server keeps `subscriptions` rows in sync from `POST /webhooks/revenuecat`. The webhook auth is a static Authorization-header shared secret (RevenueCat's documented model — *no* HMAC); `REVENUECAT_WEBHOOK_SECRET` must equal the header value set in the RevenueCat dashboard.

## Server-specific conventions

- All config flows through `src/config.ts`; do not read `process.env` elsewhere. The one exception is `src/services/push.ts` reading `GOOGLE_APPLICATION_CREDENTIALS` — that var is consumed by the Firebase Admin SDK itself, not our config.
- Validate at the boundary with Fastify JSON schemas on request bodies.
- No native build steps in dependencies: `bcryptjs` (not `bcrypt`), built-in `fetch` (no axios).
- Dev-only routes in `src/routes/dev.ts` are registered only when `NODE_ENV !== 'production'`.
- Tests are vitest; the build uses `tsconfig.build.json` to exclude test files.

## Client-specific conventions

- Every change must work on both iOS and Android — verify platform differences (permissions, background tasks, push delivery) before considering a feature done.
- `@/*` path alias resolves to the client root.
- Background location task lives in `src/services/location.ts` and reads tokens directly from `tokenStore` (it runs outside React).
- Push token registration uses `addPushTokenListener` to re-sync to `PUT /device/token` on rotation (`src/services/push.ts`, wired in `src/Providers.tsx`).
- Firebase config files (`GoogleService-Info.plist` / `google-services.json`) and the matching `app.json` entries are required for real push delivery. They are gitignored (not committed) but exist locally; the server side reads `firebase-service-account.json` via `GOOGLE_APPLICATION_CREDENTIALS`. See `TODO.md` for credential status.
