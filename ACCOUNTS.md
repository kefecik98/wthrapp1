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

| Account | Cost to create | Cost to test | Notes |
|---|---|---|---|
| **Domain name** | $10–15/yr | $10–15/yr | Cloudflare Registrar, Porkbun, or Namecheap all fine. Required for a real TLS cert via Let's Encrypt. |
| **DDNS** (alternative) | Free | Free | DuckDNS or Cloudflare DDNS give you a hostname pointed at your dynamic IP. Works with Let's Encrypt. Use this if you want $0 instead of buying a domain. |
| **Let's Encrypt / Certbot** | Free | Free | TLS certs, 90-day auto-renew. Configured by `server/deploy/nginx/weatheralert.conf`. |
| **Static IP from ISP** *(optional)* | Varies | Varies | Often $5–20/mo extra on residential. Not required if you use DDNS. |

## Already required, no cost

- GitHub — repo + CI, free for private repos at this size.
- Proxmox host — already provisioned.
- Ubuntu Server — free.

---

## Bottom line — "try things out" cost

| Scope | Out-of-pocket |
|---|---|
| Server + alert engine + Android client (sideloaded) + DDNS | **$0** |
| Add iOS client (real device) | **$99/yr** (Apple Developer) |
| Add a real domain | **+ $10–15/yr** |
| Eventually publish to Play Store | **+ $25 one-time** |
| Production-ready, both platforms, real domain | **~$124 in year 1, $99/yr after** |

---

## Registration order

1. **Free, do first**: Tomorrow.io, Firebase, Google Cloud OAuth,
   RevenueCat, DuckDNS (or buy a domain). Enough to stand up the server
   on the rack and validate end-to-end on Android.
2. **When Android validates**: Apple Developer Program ($99). Enrolment
   lag is the long pole — start it the moment you have momentum, not
   later. While it's pending, Apple-side work is blocked but everything
   else continues.
3. **When ready to ship**: Google Play Console ($25 one-time).

**Long-pole warning:** Apple Developer enrolment is the single biggest gate
on the project. Push iOS uses APNs, APNs needs an Apple Dev account, Sign
in with Apple needs one too, and approval is human-reviewed. Worth
starting that application even before server validation is finished if
iOS is a launch target.
