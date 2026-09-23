# WeatherAlert — TODO

Living tracker, ordered as the critical path to launch. Check items off when
done; add new items as they surface.
Legend: `[ ]` open · `[x]` done · `(BLOCKED)` needs an external account or
credential · `(DECISION)` needs a product decision from K.

**Launch target: Android only** (decided 2026-09-23). iOS work is parked in
"Deferred — iOS" at the bottom and does not gate launch. Nothing Android-side
waits on Apple enrolment.

---

## Actionable now (code, no blockers)

- [x] **Cross-cycle forecast cache** — `src/services/forecastCache.ts`.
      Grid-keyed (~0.1°), TTL'd (`FORECAST_CACHE_TTL_MS`, default 10 min),
      with in-flight dedup so the overlapping free/paid cycles share one
      upstream call, no caching of failures, and expiry-pruning plus a size
      ceiling (`FORECAST_CACHE_MAX_ENTRIES`). Both the alert engine and
      `GET /weather` read through it — `fetchMinutely` is no longer called
      directly anywhere. Call volume is now ~144/day/cell regardless of cron
      cadence or users-per-cell, down from ~288 (paid) + 24 (free) + every
      in-app forecast view. 8 unit tests in `forecastCache.test.ts`.
- [x] Alert-engine cron cadence trade-off — resolved by the cache rather than
      by retuning: with spend set by the cache TTL, cadence now buys only
      lead-time precision (how soon an event is noticed), at no extra call
      cost. Documented at `ALERT_ENGINE_CRON` in `.env.example`; the 5-min
      paid / hourly free cadences stand.
- [x] **Account deletion** (store rejection blocker — Google Play Data
      Deletion policy; required for any app that supports account creation).
      - [x] Server `DELETE /account` endpoint — deleting the `users` row
            cascades to location, preferences, alert_log, and subscriptions
            via the existing FK `onDelete: Cascade`, and the FCM token lives on
            the user row so it goes too. Session invalidation is automatic —
            once the row is gone, `authenticate` and `/auth/refresh` reject the
            deleted user's tokens (user-not-found). Route + 3 integration tests
            (`src/routes/account.ts`, `account.test.ts`).
      - [x] Client UI to trigger it (with a confirm step) — "Delete account"
            button on the home screen fires a two-step destructive `Alert`
            confirm, then `useDeleteAccount` (DELETE /account) which clears the
            session on success. Hook in `src/hooks/useAuth.ts`; UI +
            confirmation in `app/(tabs)/index.tsx`; tests in
            `src/__tests__/screens/home-delete-account.test.tsx`.
      - [x] Public web page for deletion requests —
            `server/deploy/caddy/legal/delete-account.html`, served by Caddy
            at `https://<domain>/legal/delete-account` (works without the
            app, as Play requires). Goes live with the first deploy.
- [x] **Free/paid tier — client gating.** `app/(tabs)/preferences.tsx` now
      branches on `useSubscription().isActive`. Free users get a "You're on
      the free plan" banner, Rain shown as *Included*, and locked 🔒 Premium
      rows for snow/hail/thunder/wind, lead time and rain intensity — each
      routing to `/paywall` instead of writing a preference the engine
      ignores. The master notifications switch stays live on both tiers
      (the engine honours it either way). Paywall gained a free-vs-Premium
      comparison table and the home screen no longer claims alerts "require a
      subscription". 9 tests in `preferences-gating.test.tsx`.
- [x] **Paywall subscription disclosures.** Each plan now shows price per
      period and any free trial / intro price (`src/lib/subscriptionTerms.ts`,
      from RevenueCat's ISO 8601 period + intro price), plus renewal and
      cancellation terms, a "Manage or cancel" link to the store for active
      subscribers, and Terms of Use + Privacy Policy links
      (`config.legal.*`, defaulting to `<API_URL>/legal/...`). Tests in
      `subscriptionTerms.test.ts` + `paywall.test.tsx`.
- [x] **Background-location prominent disclosure (Play rejection
      blocker).** `components/location-disclosure.tsx` — a modal that says
      what's collected, that it's collected while the app is closed, why, and
      who it's shared with, and only leads to the OS prompt on an explicit
      Continue. Skipped when background permission is already granted. The
      home screen's Setup card also gained one-line rationales for location
      and notifications. Tests in `home-location-disclosure.test.tsx` pin
      the ordering (no OS prompt without Continue).
- [ ] **Real app icon + splash.** `client/assets/images/icon.png` and the
      Android adaptive-icon/splash images are still the Expo template ("A" on
      a construction grid). Needs artwork, then swap the files `app.json`
      references.
- [x] Stale "Nginx" comments in server code now say Caddy.
- [x] HSTS — the Caddyfile sets `Strict-Transport-Security` on the API
      domain (helmet keeps `hsts: false`; the TLS terminator owns it).
- [ ] **Send the grid-cell centre, not the user's exact point, to the
      weather provider.** `forecastCache.getMinutely` passes the first
      requester's precise lat/lng to `fetchMinutely`, then serves that
      forecast to everyone in the ~11 km cell. Querying the cell centre gives
      every user in the cell the same, better-centred forecast and means the
      provider never sees a real user's coordinates — which would let the
      privacy policy say so. Small change; moot if weather moves in-house
      (see the Pirate Weather evaluation).
- [ ] **Custom alert sound/vibration (paid).** New per-user sound/vibration
      settings: needs server prefs fields + client UI. Android gotcha — a
      notification channel's sound/importance is locked after creation, so
      custom sounds need multiple channels (one per option), not edits to the
      existing `weather-alerts` channel. Design before building. Not a
      launch blocker.

---

## Phase 1 — Validate on a physical Android device

The core loop (GPS → `PUT /location` → engine → FCM push *before* weather
arrives) is **proven on the Android emulator** (2026-06-05). The emulator
run seeded location via SQL, so the real location path is still unproven.

- [x] Run the app on a custom dev client (Android) — debug APK on the
      `WeatherAlert_Pixel` emulator (Play Store image), JS served by Metro.
- [x] Drop `client/google-services.json` + `client/GoogleService-Info.plist`
      into place (in place; `app.json` references them; gitignored).
- [x] **Core proof (Android emulator):** registered in-app → real FCM token
      bound → the node-cron engine matched live weather and delivered the
      push to the device. Required an IAM fix — see Done. The send itself was
      verified with `server/trigger_cycle.ts`.
- [ ] Repeat on a **physical Android phone** and exercise the background
      significant-change location task with real GPS movement — including
      with the app swiped away and the phone idle (Doze / battery
      optimisation is where background location usually dies).
- [ ] Repeat once more against the **production server** (after Phase 4)
      with a release build, not a debug APK — release builds block cleartext
      HTTP and strip dev tooling, so they can behave differently.

## Phase 2 — External accounts (Android launch)

- [ ] (BLOCKED) **Domain** (~$12/yr). Must be chosen before the first
      release build — `EXPO_PUBLIC_API_URL` is baked into the APK/AAB and
      can't change without breaking installed copies.
- [ ] (BLOCKED) **VPS** with a static IP (~€4/mo) for the `frps` relay.
- [ ] (BLOCKED) Google OAuth client IDs — Android + web — in the same Google
      Cloud project as Firebase. The Android client needs the SHA-1 of the
      **Play App Signing** key (from Play Console), not just the local debug
      key, or Google sign-in fails only in store builds. Sets
      `GOOGLE_CLIENT_IDS` (server, comma-separated) +
      `EXPO_PUBLIC_GOOGLE_ANDROID_CLIENT_ID` / `_WEB_CLIENT_ID` (client).
- [ ] (BLOCKED) RevenueCat dashboard: Android app, entitlement + offering,
      Play subscription products (created in Play Console first), Google
      Play service-account credentials so RevenueCat can validate purchases,
      public SDK key `EXPO_PUBLIC_REVENUECAT_ANDROID_KEY`, and webhook →
      `https://<domain>/webhooks/revenuecat` with Authorization header =
      `REVENUECAT_WEBHOOK_SECRET`.
- [ ] (BLOCKED) **Google Play Console ($25 one-time).** Start early:
      identity verification takes days, and new *personal* developer
      accounts must run a closed test (currently 12+ testers opted in for
      14 continuous days) before production access is granted. Confirm the
      current rule at signup. An organization account skips the closed-test
      rule but needs a D-U-N-S number.

## Phase 3 — Product decisions

- [x] (DECISION) Free-tier model — **decided: limited-free.** Free = rain
      only, hourly poll, "rain expected within the hour"; paid = all event
      types, 5-min poll, customizable lead time (+ planned sound/vibration).
      Server alert-engine tiering implemented (`ALERT_ENGINE_CRON` now 5-min,
      new `ALERT_ENGINE_FREE_CRON` hourly). Client gating now implemented too
      (locked rows + upsell on the preferences screen).
- [x] (DECISION) Launch platform — **Android only** (2026-09-23).
- [ ] (DECISION) Tomorrow.io plan/tier — still open, but the cross-cycle cache
      has landed and changed the math: the free tier now supports ~3
      continuously-active cells instead of being validation-only. See the
      call-volume note below; decide against real closed-test usage.
- [ ] (DECISION) Subscription price + period(s) — needed before the Play
      products and RevenueCat offering can be created.

## Phase 4 — Production deploy (rack, spec §7)

Purpose: take the validated app from "runs in dev" to a reliable, secure,
internet-reachable HTTPS service the phones can hit. **Runbook:
`server/deploy/DEPLOY.md`** — the section numbers below point into it.

Shape: one Proxmox VM runs `db` + `app` + `caddy` + `frpc` under Docker
Compose (`server/deploy/docker-compose.prod.yml`); a rented VPS runs only
`frps` as a raw TCP relay on :443. TLS terminates in Caddy on the rack.
**No inbound port on the home router**, and no third party terminates TLS.
CI builds the image; the rack only pulls.

- [x] Deploy stack written: Compose file, `Dockerfile`, Caddyfile
      (TLS-ALPN-01, PROXY protocol v2 listener), `frpc.toml` / VPS `frps`
      config, `deploy.sh` (pull → one-shot migrate → up → health check →
      auto-rollback), and the four-job CI (`server` / `client` / `image` /
      `deploy`).
- [ ] (BLOCKED on domain + VPS) **DNS** — one `A` record, `api.<domain>` →
      VPS IP. Must resolve before Caddy's first cert request. (§2)
- [ ] (BLOCKED on VPS) **VPS** — Docker, `ufw` allowing only 22/443/7000
      (tighten 7000 to the home IP if it's static), `server/deploy/vps/.env`
      with `FRP_VERSION` + a fresh `openssl rand -hex 32` shared secret,
      `docker compose up -d`. (§3)
- [ ] **App VM** — Ubuntu 24.04, 2 vCPU / 4 GB / 32 GB system disk plus a
      **separate ~64 GB data disk** mounted at `/srv/weatheralert`
      (= `DATA_DIR`). Docker, outbound-only `ufw`, repo cloned to
      `/opt/weatheralert`. (§4)
- [ ] **Production secrets** in `server/deploy/.env` (not `server/.env`):
      strong `JWT_ACCESS_SECRET` / `JWT_REFRESH_SECRET`, DB password, the
      same frp secret as the VPS, `API_DOMAIN`, `ACME_EMAIL`, real
      `REVENUECAT_WEBHOOK_SECRET` matching the dashboard, `TOMORROW_API_KEY`,
      `GOOGLE_CLIENT_IDS`, `OPERATOR_NAME` + `SUPPORT_EMAIL` (shown on
      the `/legal` pages). `NODE_ENV=production`, `TRUST_PROXY=true`, and
      **`ENABLE_DEV_ROUTES` unset**. `DATABASE_URL` and
      `GOOGLE_APPLICATION_CREDENTIALS` are derived by Compose — don't set
      them. Copy `firebase-service-account.json` into
      `/opt/weatheralert/server/`. (§4)
- [ ] **First deploy by hand** — `docker login ghcr.io` with a
      `read:packages` PAT, then `bash deploy.sh`. Verify
      `curl https://api.<domain>/health` from *outside* the home network —
      that's the only check that exercises DNS → VPS → tunnel → Caddy → app.
      (§5)
- [ ] **Verify real client IPs reach the app** — hit `/auth/login` a few
      times from two different networks and confirm they get separate
      rate-limit buckets. If they share one, the frpc
      `proxyProtocolVersion` ↔ Caddy `proxy_protocol` pair is broken. (§9)
- [ ] **Self-hosted Actions runner** on the app VM, as the user that owns
      `/opt/weatheralert`, installed as a service, in the `docker` group.
      Then set repo variable `DEPLOY_ENABLED=true`. Keep the repo private.
      (§7)
- [ ] **Postgres backups** — the `pg_dump` cron + 14-day retention in §8,
      *and* shipping `/srv/weatheralert/backups` off the VM (NAS rsync or
      Proxmox Backup Server). Do one test restore before launch.
- [ ] **Docker log rotation** — `log-opts` (`max-size`, `max-file`) in
      `/etc/docker/daemon.json`, or the app logs grow unbounded. (§9)
- [ ] **Uptime check** — something outside the rack polling
      `https://api.<domain>/health` and alerting K when it fails (the tunnel
      can drop without anything on the rack noticing).
- [ ] **Point the client at production** — `EXPO_PUBLIC_API_URL=https://api.<domain>`
      in the env used for release builds.

## Security hardening (pre-launch)

From the 2026-06-15 security review. The two account-takeover / session
findings are fixed (see Done); these are the rest, by severity. All are code,
no external blockers.

- [x] (MEDIUM) Dev routes now fail *closed* — they register on a positive
      `ENABLE_DEV_ROUTES=true`, not on `NODE_ENV !== "production"`, so a
      missing or misspelled `NODE_ENV` can't expose
      `POST /dev/seed-subscription`. Setting it while `NODE_ENV=production`
      logs a warning. Pinned to `false` in `vitest.config.ts` so the guard
      test can't be masked by a developer's local `.env`.
- [x] (MEDIUM) Rate limiting — `@fastify/rate-limit` with a global default
      (`RATE_LIMIT_MAX`, 120/min) and a tight bucket on every `/auth/*` route
      including Apple/Google (`RATE_LIMIT_AUTH_MAX`, 10/min) via
      `app.authRateLimit`. `/health` is exempt so uptime checks aren't
      throttled. `TRUST_PROXY=true` (set it in production) makes buckets key
      on the real client IP forwarded by Caddy rather than the proxy's.
- [x] (LOW) JWT algorithm pinned to HS256 on both sign and verify in
      `lib/tokens.ts`; an `alg: none` token is rejected (test).
- [x] (LOW) Password capped at `maxLength: 128` in the auth schema.
- [x] (LOW) `@fastify/helmet` registered with `hsts: false` (the TLS
      terminator owns HSTS — see the HSTS item in "Actionable now").
- [ ] (LOW) `@fastify/cors` with an allowlist — still open, and deliberately:
      it is only needed if the Expo `web` target becomes a real shipping
      surface. Not planned for the Android launch.
- [x] (LOW) RevenueCat webhook now has a JSON body schema validating `event`,
      `type`, `app_user_id`, `product_id` and `expiration_at_ms`.
      `additionalProperties` stays open on purpose (RevenueCat adds fields
      over time); the shared-secret check moved to `onRequest` so it runs
      *before* validation and an unauthenticated caller learns nothing about
      the payload shape.
- [x] (LOW) The `data: request.body` mass-assignment rule is now documented in
      `server/CLAUDE.md` and `server/CONTEXT.md`.

## Phase 5 — Release build + Google Play launch

Rejection blockers first — submitting without these gets the app bounced by
review, so treat them as gating, not polish.

**Release build**

- [x] **Release build config.** `client/eas.json` (development / preview APK
      / production AAB profiles, remote auto-incremented `versionCode`) and
      `client/app.config.js`, which fails any non-development build whose
      `EXPO_PUBLIC_API_URL` isn't https and takes the gitignored Firebase
      file from an EAS file variable. Steps in `client/RELEASE.md`.
- [ ] (BLOCKED on Expo account + domain) First production build:
      `eas init` (commit the projectId it writes), set the production EAS
      env vars + `GOOGLE_SERVICES_JSON` file var, build, and **back up the
      upload keystore** off this laptop. Enrol in **Play App Signing** on
      first upload. (`client/RELEASE.md`)

**Policy + listing (Play Console)**

- [ ] **Privacy policy + Terms — drafted, need K's review.**
      `server/deploy/caddy/legal/{privacy,terms}.html`, served at
      `/legal/privacy` and `/legal/terms`, written against what the schema
      actually stores. Caddy fills `OPERATOR_NAME` / `SUPPORT_EMAIL` from
      `deploy/.env`. Before launch: read both, set those two values (the
      support inbox must be monitored — deletion requests go there), and add
      a governing-law clause to the terms. Plain-language drafts, not legal
      advice.
- [ ] **Data safety form** — location (precise, background), email,
      device ID (FCM token), purchase history; all encrypted in transit;
      deletion available.
- [ ] **Background location permission declaration** — Play Console form
      plus a short video showing the prominent disclosure screen, the OS
      prompt, and the alert feature that needs it. Tie the justification to
      the core value prop (alerts must fire before weather reaches you, even
      when the app is closed).
- [ ] **Account deletion URL** in the Data safety section (page from
      "Actionable now").
- [ ] **App access / reviewer credentials** — the app is fully
      login-gated, so give Play review a working demo account in "App
      access". Consider a demo account with an active subscription so the
      reviewer sees paid features.
- [ ] Store listing — name, short + full description, feature graphic,
      phone screenshots, content rating questionnaire, target audience,
      ads declaration (none).
- [ ] **Closed test track** — upload the AAB, recruit the required testers,
      and run the required 14 days (personal accounts). Use it as the real
      beta: watch alert delivery, Tomorrow.io call volume, and crash reports.
- [ ] Apply for production access, then staged rollout (e.g. 20% → 100%).
- [ ] Final security pass before going public — spot-check PII/location
      handling, confirm dev routes 404 in prod, and fire a real RevenueCat
      test event at the production webhook.

---

## Deferred — iOS (not gating the Android launch)

Parked 2026-09-23. Picking iOS up later means, roughly, in this order:

- [ ] Apple Developer Program enrolment ($99/yr) — human-reviewed, 1–3+
      days; gates everything below. Sets `APPLE_CLIENT_ID` (bundle id).
- [ ] APNs auth key (`.p8`) uploaded to Firebase → Cloud Messaging.
- [ ] Google OAuth iOS client ID (`EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID`) +
      RevenueCat iOS app / App Store products (`EXPO_PUBLIC_REVENUECAT_IOS_KEY`).
- [ ] iOS end-to-end on a physical iPhone (the simulator can't get a push
      token), built via EAS Build or a Mac.
- [ ] App Store review blockers: account-deletion path in review notes
      (5.1.1(v)), demo account (2.1), paywall plan length + functional
      Terms/EULA + Privacy links (3.1.2), background-location justification,
      privacy nutrition labels.

---

## Decisions — reference

### Tomorrow.io call-volume estimate (resolves Phase 3 tier decision)

> **Update — the cross-cycle cache has landed, so the figures below are
> historical.** Actual volume is now `1440 / TTL_minutes` per occupied cell,
> independent of cron cadence and users-per-cell: **~144 calls/day/cell** at
> the default 10-minute TTL, and in-app `GET /weather` views are served from
> the same cache. That keeps roughly **3 continuously-active cells** inside
> the 500/day free tier (and comfortably inside 25/hr, which now costs ~6
> calls/hr/cell). Raising `FORECAST_CACHE_TTL_MS` trades lookahead for
> headroom: a 15-min TTL is ~96/day/cell.
>
> (Prior note, for context: paid polls every 5 min and free hourly, so
> pre-cache volume was ~288 + ~24 runs/day/cell.)

Free tier (per `ACCOUNTS.md`): **500 calls/day, 25/hr, 3/s.**

Engine cost as the code stands today (per-cycle cache only):
`calls/day ≈ runs/day × occupied cells = (1440 / cron_minutes) × cells`.
At the default 2-min cron that's **720 × cells/day** and **30 × cells/hr**.

Consequence: even **one** continuously-active user (1 cell) = ~720/day and
30/hr — already over both free-tier limits. The free tier is therefore
*validation/intermittent only* until the cross-cycle cache lands.

With a cross-cycle cache (TTL ~10 min) the cost drops to ~6 calls/hr/cell
regardless of cron cadence or users-per-cell → ~96/cell/day. That keeps
roughly **4–5 active cells inside the free tier** — enough for a small beta.

Rough production sizing (24/7, current code, no cache):

| Active cells (peak) | Engine calls/day | Verdict |
|---|---|---|
| 1 (solo test) | ~720 | over free tier |
| ~3 (10 users, one city) | ~2,160 | paid tier |
| ~15 (100 users) | ~10,800 | paid tier |
| ~60 (1,000 users) | ~43,200 | paid (~$60/mo) |

Plus on-demand `GET /weather` ≈ 1 call per in-app forecast view.

**Recommendation (updated):** the cache is in, so the free tier is viable for
a small beta — about 3 continuously-active cells, more if you raise the TTL.
Move to a paid Tomorrow.io tier only once real concurrent users span more
cells than that. Re-measure against real usage before committing to a plan.

---

## Done

- [x] Provision PostgreSQL + apply migrations (Docker + `prisma migrate deploy`)
- [x] Tomorrow.io API key in `.env`, verified against the live `/timelines`
      endpoint (HTTP 200)
- [x] Firebase project + server service-account JSON
      (`GOOGLE_APPLICATION_CREDENTIALS`) obtained
- [x] Firebase client config files obtained; `app.json` wired via
      `googleServicesFile` (Android + iOS)
- [x] Fix Tomorrow.io `startTime` → `time` parsing in `fetchMinutely`
      (+ regression tests) so live data yields real lead times
- [x] Reject unknown request fields (Ajv `removeAdditional:false`); load
      `.env` in vitest config so `npm test` needs no shell setup
- [x] Server unit + integration tests — 70 passing against real Postgres
- [x] FCM token rotation — addPushTokenListener re-syncs token (Providers)
- [x] Push handler + deep-link — foreground handler + tap routes to
      app/forecast.tsx (incl. cold-start)
- [x] iOS location copy + app identity + location/notification/Apple plugins
      in app.json
- [x] Provider-sub mapping — users.provider/provider_sub + migration; social
      routes resolve by (provider,sub), email-link fallback
- [x] RevenueCat scaffold — purchases service, useSubscription,
      app/paywall.tsx, SDK keyed to user id; needs RC keys to run
- [x] CI workflow — server typecheck+tests, client typecheck+lint
- [x] FCM push delivery unblocked + proven end-to-end on Android (2026-06-05).
      Root cause: the Firebase service account had only the basic `Editor`
      role, which excludes `cloudmessaging.messages.create`, so
      `admin.messaging().send()` threw `messaging/mismatched-credential`.
      Fixed by granting the SA the **Firebase Admin** role in GCP IAM
      (project-level, so it also covers the rack deploy). Verified: real
      token from the emulator → live Reykjavik rain → cron match → push on
      device.
- [x] Free/paid alert tiers (server, 2026-06-15) — two node-cron schedules:
      free = hourly rain-only ("within the hour"), paid = 5-min + full prefs.
      Mutually exclusive by subscription status; shared `alert_log` dedup.
      Spec §6.3 / §8.4 updated; `.env.example` documents `ALERT_ENGINE_FREE_CRON`.
- [x] Security fixes (2026-06-15) — social sign-in now requires a
      provider-verified email (`email_verified` gate in apple/googleAuth),
      closing an account-takeover vector; tokens are revocable via a
      `tokenVersion` claim checked in `authenticate` + `/auth/refresh`, so
      deleted / logged-out users' tokens stop working (migration
      `..._user_token_version`).
- [x] Deploy moved from two-VM PM2 + Nginx + port-forward to one-VM Docker
      Compose behind a VPS frp relay (2026-09-23). CI builds and pushes a
      SHA-tagged image to GHCR; the rack pulls. PM2/Nginx files kept only as
      a retired fallback.
