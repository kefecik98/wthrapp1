# WeatherAlert — Accounts & Credentials

External accounts the project needs, with current costs to register and to
test against. See `TODO.md` for which of these are currently blocking, and
`server/deploy/DEPLOY.md` for where each credential is consumed on the rack.

All "free tier" limits are current as of writing and may change — confirm
at signup.

---

## Server-side (validate API + alert engine + push)

| Account | Cost to create | Cost to test | Notes |
|---|---|---|---|
| **Tomorrow.io** | Free | Free | Free tier: 500 calls/day, 25/hr, 3/s. Plenty for solo testing; the engine's grid-clustering keeps calls low. Paid tiers start around $60/mo (rare to need during dev). Used by `TOMORROW_API_KEY`. |
| **Firebase project + FCM service account** | Free | Free | Spark (free) plan covers unlimited FCM push. Same project produces the server's service-account JSON (`GOOGLE_APPLICATION_CREDENTIALS`) and the client's `GoogleService-Info.plist` / `google-services.json`. Requires a Google account. |
| **Google Cloud OAuth client IDs** (Sign in with Google) | Free | Free | Created in the same Google Cloud Console as Firebase. Three client IDs needed: iOS, Android, web. Used by `GOOGLE_CLIENT_IDS` (server, comma-separated) and `EXPO_PUBLIC_GOOGLE_*` (client). |
| **RevenueCat** | Free | Free | Free up to $2,500/mo MRR. Sandbox/testing is free. Webhook setup is in their dashboard. Used by `EXPO_PUBLIC_REVENUECAT_IOS_KEY` / `_ANDROID_KEY` (client) and `REVENUECAT_WEBHOOK_SECRET` (server). |

## Mobile distribution / signing

| Account | Cost to create | Cost to test | Notes |
|---|---|---|---|
| **Apple Developer Program** | **$99/yr** | $99/yr | Required for: Sign in with Apple capability, APNs auth key (FCM iOS push), Push Notifications + Background Modes entitlements, on-device builds beyond 7 days, App Store. Approval takes 1–3 days, sometimes longer for individuals. No usable free tier for this app on iOS. Sets `APPLE_CLIENT_ID` (bundle id, the `aud` claim). |
| **Google Play Console** | **$25 one-time** | $0 to start | Only needed for internal-testing tracks or production release. **Sideloading a debug APK to a physical Android device is free** — you can validate the full Android client without paying this. |
| **Expo EAS Build** *(optional)* | Free | Free / $19 mo | Free tier: 30 builds/month, fine for personal dev. Lets you produce a custom dev client without setting up Xcode + Android Studio locally. Skip if you already have native toolchains installed (`expo prebuild` is free). |

## Networking for the rack

The rack is reached through a VPS relay (`frps`) that the rack dials out to —
no inbound port on the home router. See `server/deploy/DEPLOY.md`.

| Account | Cost to create | Cost to test | Notes |
|---|---|---|---|
| **Domain name** | $10–15/yr | $10–15/yr | **Required.** Cloudflare Registrar, Porkbun, or Namecheap all fine (registrar only — don't proxy traffic through Cloudflare; TLS must terminate on the rack). One `A` record → the VPS IP. The hostname is baked into the app build, so pick it before the first release build. |
| **VPS** (frp relay) | ~€4/mo | ~€4/mo | Hetzner / Vultr / DigitalOcean smallest plan. Needs a static public IP. Runs only `frps` as a raw TCP relay on :443 — holds no certificate and can't read traffic. |
| **Let's Encrypt** (via Caddy) | Free | Free | Caddy on the rack obtains and renews certs automatically over TLS-ALPN-01. Needs only `ACME_EMAIL`. |

DDNS and a static home IP are no longer needed — the VPS IP is the only
public address, and it's static.

## Already required, no cost

- GitHub — repo + CI, free for private repos at this size.
- Proxmox host — already provisioned.
- Ubuntu Server — free.

---

## Bottom line — "try things out" cost

| Scope | Out-of-pocket |
|---|---|
| Server + alert engine + Android client (sideloaded), local only | **$0** |
| Put the server on the internet (domain + VPS) | **~$12/yr + ~€4/mo** |
| Eventually publish to Play Store | **+ $25 one-time** |
| **Android launch** (domain + VPS + Play) | **~$37 + ~€4/mo in year 1** |
| Add iOS later | **+ $99/yr** |

---

## Registration order

Launch target is **Android only** (2026-09-23), so Apple is off the
critical path.

1. **Free, do first**: Tomorrow.io, Firebase, Google Cloud OAuth,
   RevenueCat.
2. **To go live**: a domain + a VPS. Enough to stand up the server on the
   rack and validate end-to-end on a physical Android phone.
3. **Early, not last**: Google Play Console ($25 one-time). Identity
   verification takes days, and new personal accounts must run a 14-day
   closed test before production access — that's now the long pole.
4. **Later, if iOS**: Apple Developer Program ($99/yr).

**Long-pole warning:** for the Android launch, the long pole is Play
Console — account verification plus the mandatory closed-test period for
new personal accounts. Register it as soon as the server is reachable, so
the 14-day clock runs while you finish the store listing.
