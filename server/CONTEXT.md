# Server — Context & Architecture

## What this is

The WeatherAlert backend: a single Node.js process that serves the mobile
client's REST API and runs the alert engine that decides when to push a
weather warning. Built from `../weather-app-spec.md` (the authoritative spec).

## Stack

| Layer        | Choice                              |
|--------------|-------------------------------------|
| Runtime      | Node.js 22                          |
| Framework    | Fastify 5                           |
| Language     | TypeScript (CommonJS, strict)       |
| Database     | PostgreSQL via Prisma 6             |
| Scheduler    | node-cron (in-process)              |
| Auth         | JWT access + refresh (`jsonwebtoken`) |
| Passwords    | bcryptjs                            |
| Push         | Firebase Admin SDK (FCM)            |
| Weather data | Tomorrow.io (`fetch`, no HTTP lib)  |

## Directory map

```
prisma/schema.prisma   5 tables from spec §5 (snake_case mapped to camelCase)
src/
  index.ts             Fastify boot, route registration, graceful shutdown
  config.ts            env loading + validation (throws early if missing)
  db.ts                shared PrismaClient singleton
  lib/
    password.ts        bcrypt hash/verify
    tokens.ts          sign/verify access + refresh JWTs
  plugins/
    auth.ts            `authenticate` preHandler -> sets request.userId
  routes/
    auth.ts            POST /auth/register | /auth/login | /auth/refresh
    social.ts          POST /auth/apple | /auth/google (token verified)
    location.ts        PUT /location            (auth)
    weather.ts         GET /weather             (auth)
    preferences.ts     GET|PUT /preferences     (auth)
    device.ts          PUT /device/token        (auth — registers FCM token)
    webhooks.ts        POST /webhooks/revenuecat (shared-secret verified)
    dev.ts             POST /dev/seed-subscription (auth — DEV ONLY)
  services/
    weather.ts         Tomorrow.io client + findNextEvent threshold logic
    push.ts            lazy FCM init + sendPush
    appleAuth.ts       verify Apple identity token (JWKS)
    googleAuth.ts      verify Google id_token (google-auth-library)
  engine/
    alertEngine.ts     cron cycle: active users -> grid cluster -> forecast
                       -> match -> dedup via alert_log -> FCM push
```

## How the alert engine works (spec §6.3)

1. Cron fires (`ALERT_ENGINE_CRON`, default every 2 min).
2. Load users that are subscribed (`active`/`trial`), have notifications on,
   a fresh location, and an FCM token.
3. Cluster users into ~0.1° grid cells; fetch one Tomorrow.io forecast per
   cell (cached for the cycle) instead of one call per user.
4. `findNextEvent` matches the forecast against each user's enabled event
   types and intensity thresholds.
5. If the event is within the user's lead time, insert into `alert_log`.
   The unique `(userId, eventType, eventStartAt)` constraint is the dedup
   mechanism — a duplicate insert throws and the alert is skipped.
6. Send the FCM push.

## Running locally

```
cp .env.example .env          # fill in real secrets
npm install
docker compose up -d          # local PostgreSQL (see docker-compose.yml)
npx prisma migrate deploy     # applies prisma/migrations/
npm run dev                   # tsx watch
npm run typecheck             # tsc --noEmit (currently passes)
```

The initial migration (`prisma/migrations/20260518120000_init/`) is
generated and schema-validated; it has not been applied in this
environment because no PostgreSQL was provisioned here. The compose file
above provides one so `migrate deploy` works.

## Code conventions

- Clear, concise, professional, **commented** code (project quality bar).
- No native build steps (bcryptjs over bcrypt; built-in `fetch` over axios).
- Validate at the boundary: Fastify JSON schemas on request bodies.
- All config flows through `config.ts`; do not read `process.env` elsewhere.
- Dev-only routes (`src/routes/dev.ts`) are registered only when
  `NODE_ENV !== 'production'`; never rely on them in production code paths.
- RevenueCat webhook auth is a static Authorization-header secret (their
  documented model — no HMAC); `REVENUECAT_WEBHOOK_SECRET` must equal the
  exact header value set in the RevenueCat dashboard.

## Status

Scaffold complete and typechecks. No migration has been applied yet (no
database provisioned). Open items are tracked in the root project notes and
`../weather-app-spec.md §8`.
