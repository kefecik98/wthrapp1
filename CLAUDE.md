# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Identity

You are helping K with developing a mobile app that will act as client and a server that will process inputs from client, make api calls to determine things and report back to the client via push notifications.

## Rules

- Write in plain, clear language
- Ask clarifying questions before making assumptions
- When you are unsure, say so
- The full product spec is `weather-app-spec.md` — treat it as the source of truth for behaviour
- `server/CLAUDE.md` and `client/CLAUDE.md` add directory-specific guidance; read them when working in either

## Repository layout

Monorepo with two independent npm projects:

- `server/` — Node.js 22 + Fastify 5 + Prisma 6 + PostgreSQL. REST API plus an in-process `node-cron` alert engine.
- `client/` — React Native + Expo (SDK 54) + expo-router, TypeScript, single codebase that must compile and run on iOS and Android.
- `weather-app-spec.md` — authoritative product/architecture spec.
- `TODO.md` — living tracker of open work, blocked items (env/credentials), and pending product decisions.
- `.github/workflows/ci.yml` — CI runs server typecheck + tests and client typecheck + lint on push/PR.

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

Client (`cd client`):

| Task          | Command                |
|---------------|------------------------|
| Install       | `npm install`          |
| Start Metro   | `npx expo start`       |
| iOS           | `npm run ios`          |
| Android       | `npm run android`      |
| Web           | `npm run web`          |
| Typecheck     | `npm run typecheck`    |
| Lint          | `npm run lint`         |

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

4. **Social auth**: Apple and Google identity tokens are verified server-side (`src/services/appleAuth.ts` via JWKS, `src/services/googleAuth.ts` via `google-auth-library`). Accounts resolve by the stable `(provider, provider_sub)` key with an email-link fallback, so Apple private-relay addresses are handled. `users.password_hash` is nullable for social-only accounts.

5. **Subscriptions**: client uses RevenueCat SDK (`client/src/services/purchases.ts`, keyed to the JWT-decoded user id). Server keeps `subscriptions` rows in sync from `POST /webhooks/revenuecat`. The webhook auth is a static Authorization-header shared secret (RevenueCat's documented model — *no* HMAC); `REVENUECAT_WEBHOOK_SECRET` must equal the header value set in the RevenueCat dashboard.

## Server-specific conventions

- All config flows through `src/config.ts`; do not read `process.env` elsewhere.
- Validate at the boundary with Fastify JSON schemas on request bodies.
- No native build steps in dependencies: `bcryptjs` (not `bcrypt`), built-in `fetch` (no axios).
- Dev-only routes in `src/routes/dev.ts` are registered only when `NODE_ENV !== 'production'`.
- Tests are vitest; the build uses `tsconfig.build.json` to exclude test files.

## Client-specific conventions

- Every change must work on both iOS and Android — verify platform differences (permissions, background tasks, push delivery) before considering a feature done.
- `@/*` path alias resolves to the client root.
- Background location task lives in `src/services/location.ts` and reads tokens directly from `tokenStore` (it runs outside React).
- Push token registration uses `addPushTokenListener` to re-sync to `PUT /device/token` on rotation (`src/services/push.ts`, wired in `src/Providers.tsx`).
- Firebase config files (`GoogleService-Info.plist` / `google-services.json`) and the matching `app.json` entries are required for real push delivery; they are not in the repo (see `TODO.md`).
