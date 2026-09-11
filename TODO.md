# WeatherAlert — TODO

Living tracker, ordered as the critical path to launch. Check items off when
done; add new items as they surface.
Legend: `[ ]` open · `[x]` done · `(BLOCKED)` needs an external account or
credential · `(DECISION)` needs a product decision from K.

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
- [ ] **Account deletion** (store rejection blocker — Apple 5.1.1(v) + Google
      Play Data Deletion; required for any app that supports account creation).
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
      - [ ] Publicly reachable web page for deletion requests (store-form
            wiring waits for launch — see Phase 5).
- [x] **Free/paid tier — client gating.** `app/(tabs)/preferences.tsx` now
      branches on `useSubscription().isActive`. Free users get a "You're on
      the free plan" banner, Rain shown as *Included*, and locked 🔒 Premium
      rows for snow/hail/thunder/wind, lead time and rain intensity — each
      routing to `/paywall` instead of writing a preference the engine
      ignores. The master notifications switch stays live on both tiers
      (the engine honours it either way). Paywall gained a free-vs-Premium
      comparison table and the home screen no longer claims alerts "require a
      subscription". 9 tests in `preferences-gating.test.tsx`.
- [ ] **Custom alert sound/vibration (paid).** New per-user sound/vibration
      settings: needs server prefs fields + client UI. Android gotcha — a
      notification channel's sound/importance is locked after creation, so
      custom sounds need multiple channels (one per option), not edits to the
      existing `weather-alerts` channel. Design before building.

---

## Phase 1 — Validate on real hardware (highest technical risk)

The core loop (GPS → `PUT /location` → engine → FCM push *before* weather
arrives) is **proven on Android** (2026-06-05, emulator). Remaining gaps:
a physical Android device, the background-location path under real GPS
movement, and the entire iOS/APNs path (untested).

- [x] Run the app on a custom dev client (Android) — debug APK on the
      `WeatherAlert_Pixel` emulator (Play Store image), JS served by Metro.
- [x] Drop `client/google-services.json` + `client/GoogleService-Info.plist`
      into place (in place; `app.json` references them; gitignored).
- [x] **Core proof (Android emulator):** registered in-app → real FCM token
      bound → the node-cron engine matched live weather and delivered the
      push to the device. Required an IAM fix — see Done. The send itself was
      verified with `server/trigger_cycle.ts`.
- [ ] Repeat on a **physical Android device** and exercise the background
      significant-change location task with real GPS movement (the emulator
      run seeded location via SQL, so that path is still unproven).
- [ ] (BLOCKED) iOS end-to-end — untested. Needs Apple enrolment + APNs `.p8`
      in Firebase (Phase 2) before any iOS push can route, **a physical iPhone**
      (the simulator can't obtain a push token), and **a Mac or EAS Build** to
      produce a signed iOS build (the local toolchain is Android-only).

## Phase 2 — External accounts (blockers; mostly free)

- [ ] (BLOCKED) Google OAuth client IDs — iOS, Android, web — in the same
      Google Cloud project as Firebase. Sets `GOOGLE_CLIENT_IDS` (server,
      comma-separated audiences) + `EXPO_PUBLIC_GOOGLE_*` (client).
- [ ] (BLOCKED) RevenueCat dashboard: iOS + Android apps, entitlement +
      offering + products, public SDK keys (`EXPO_PUBLIC_REVENUECAT_IOS_KEY`
      / `_ANDROID_KEY`), and webhook → `https://<server>/webhooks/revenuecat`
      with Authorization header = `REVENUECAT_WEBHOOK_SECRET`.
- [ ] (BLOCKED) **Apple Developer Program enrolment ($99/yr) — the long
      pole.** Human-reviewed, 1–3+ days. Gates all iOS: APNs push, Sign in
      with Apple, signed builds. Start the moment iOS is a real target, even
      before validation finishes. Sets `APPLE_CLIENT_ID` (bundle id).
- [ ] (BLOCKED) APNs auth key (.p8) uploaded to Firebase → Cloud Messaging
      so iOS push routes through APNs. *(Deferred for now.)*
- [ ] (BLOCKED) Google Play Console ($25 one-time) — only for Play
      internal-testing tracks or release. Not needed to sideload-test Android.

## Phase 3 — Product decisions

- [x] (DECISION) Free-tier model — **decided: limited-free.** Free = rain
      only, hourly poll, "rain expected within the hour"; paid = all event
      types, 5-min poll, customizable lead time (+ planned sound/vibration).
      Server alert-engine tiering implemented (`ALERT_ENGINE_CRON` now 5-min,
      new `ALERT_ENGINE_FREE_CRON` hourly). Client gating now implemented too
      (locked rows + upsell on the preferences screen).
- [ ] (DECISION) Tomorrow.io plan/tier — still open, but the cross-cycle cache
      has landed and changed the math: the free tier now supports ~3
      continuously-active cells instead of being validation-only. See the
      updated call-volume note below; decide against real beta usage.

## Phase 4 — Production hardening + deploy (rack, spec §7)

Purpose: take the validated app from "runs in dev" to a reliable, secure,
internet-reachable HTTPS service the phones can hit (auth, location, weather,
RevenueCat webhook). Runbook: `server/deploy/DEPLOY.md`.

- [ ] Real production secrets — generate strong `JWT_ACCESS_SECRET` /
      `JWT_REFRESH_SECRET`, a real DB password, real `REVENUECAT_WEBHOOK_SECRET`
      matching the dashboard; set `NODE_ENV=production` (also disables dev
      routes). Current `.env` still has `change-me` placeholders.
- [ ] (BLOCKED) Provision the two Ubuntu 24.04 VMs on Proxmox (app + Postgres).
- [ ] (BLOCKED) Postgres VM: create db/user, `prisma migrate deploy`, restrict
      access to the app VM only.
- [ ] (BLOCKED) App VM: Node 22, `npm run build`, run under PM2 via
      `server/deploy/ecosystem.config.cjs`; enable PM2 startup (systemd) so it
      survives reboot; log rotation.
- [ ] (BLOCKED) Nginx reverse proxy (`server/deploy/nginx/weatheralert.conf`)
      + TLS via Certbot/Let's Encrypt (90-day auto-renew).
- [ ] (BLOCKED) Domain or DDNS (DuckDNS/Cloudflare) → rack public IP; router
      forwards 443 (+80 for ACME) to the Nginx VM. First confirm the ISP gives
      an inbound-reachable IP (not CGNAT) — if CGNAT, use a tunnel (Cloudflare
      Tunnel / Tailscale Funnel) instead of port-forwarding.
- [ ] (BLOCKED) Postgres backups — `pg_dump` cron at minimum, shipped off-box.
- [x] CI/CD deploy pipeline built (self-hosted-runner model). `deploy` job in
      `.github/workflows/ci.yml` runs on push to `main`, gated `needs: server`
      (tests must pass) + `if:` main-only, on a `self-hosted` runner; it runs
      `server/deploy/deploy.sh` (sync → npm ci → migrate deploy → build → pm2
      reload → health check). No inbound reachability needed. Runner install +
      first activation are documented in DEPLOY.md §8 but (BLOCKED) on the app
      VM existing.
- [ ] Point the client's API base URL at the production HTTPS endpoint.

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
      on the real client IP behind Nginx rather than the proxy's.
- [x] (LOW) JWT algorithm pinned to HS256 on both sign and verify in
      `lib/tokens.ts`; an `alg: none` token is rejected (test).
- [x] (LOW) Password capped at `maxLength: 128` in the auth schema.
- [x] (LOW) `@fastify/helmet` registered with `hsts: false` (Nginx terminates
      TLS and owns HSTS).
- [ ] (LOW) `@fastify/cors` with an allowlist — still open, and deliberately:
      it is only needed if the Expo `web` target becomes a real shipping
      surface. Decide that first.
- [x] (LOW) RevenueCat webhook now has a JSON body schema validating `event`,
      `type`, `app_user_id`, `product_id` and `expiration_at_ms`.
      `additionalProperties` stays open on purpose (RevenueCat adds fields
      over time); the shared-secret check moved to `onRequest` so it runs
      *before* validation and an unauthenticated caller learns nothing about
      the payload shape.
- [x] (LOW) The `data: request.body` mass-assignment rule is now documented in
      `server/CLAUDE.md` and `server/CONTEXT.md`.

## Phase 5 — Store launch

Rejection blockers first — submitting without these gets the app bounced by
review, so treat them as gating, not polish. (The account-deletion *flow*
itself moved to "Actionable now" since it's code with no external blocker.)

- [ ] List the account-deletion **web URL** in Play's Data safety form + the
      deletion-request path in App Store review notes (build the deletion flow
      itself in "Actionable now").
- [ ] **Reviewer demo account (Apple rejection blocker).** The app is fully
      login-gated, so App Review needs working demo credentials (or a demo
      mode) in the App Store Connect review notes (Apple 2.1), or they can't
      get past the login screen.
- [ ] **Paywall legal disclosures (Apple rejection blocker).**
      `app/paywall.tsx` has Restore ✓ but for auto-renewing subscriptions must
      also show each plan's length/period and include functional Terms of Use
      (EULA) + Privacy Policy links before purchase (Apple 3.1.2). Today it
      shows only title + price.
- [ ] Privacy policy + store data-safety / privacy-nutrition disclosures —
      **mandatory** on both stores because the app collects GPS *and
      background* location. Not started.
- [ ] Apple App Review prep — background location is heavily scrutinized;
      write a clear justification tied to the value prop or risk rejection.
- [ ] Permission-priming UX for location + notifications before the OS prompt.
- [ ] Final security pass before going public — work through "Security
      hardening (pre-launch)" above; spot-check PII/location handling and the
      RevenueCat shared-secret webhook once deployed.

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
</content>
