# Android release builds

How to produce a signed Play Store build (AAB). Debug APKs for local testing
are a separate path (`npx expo prebuild --platform android`, then
`./gradlew :app:assembleDebug` in `android/`).

Builds use **EAS Build**. It can build in Expo's cloud or on this machine
(`--local`, using the Android SDK + JDK 17 already installed here). Either
way it needs a free Expo account, because EAS stores the signing key and the
version counter.

---

## One-time setup

```bash
cd client
npx eas-cli login
npx eas-cli init          # links the project; writes extra.eas.projectId into app.json — commit that
```

### Environment variables

`EXPO_PUBLIC_*` values are baked into the build and your local `.env` is not
uploaded, so set them per EAS environment:

```bash
npx eas-cli env:create --environment production --visibility plaintext \
  --name EXPO_PUBLIC_API_URL --value https://api.<your-domain>
npx eas-cli env:create --environment production --visibility plaintext \
  --name EXPO_PUBLIC_REVENUECAT_ANDROID_KEY --value <key>
npx eas-cli env:create --environment production --visibility plaintext \
  --name EXPO_PUBLIC_GOOGLE_ANDROID_CLIENT_ID --value <id>
npx eas-cli env:create --environment production --visibility plaintext \
  --name EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID --value <id>
```

`app.config.js` refuses to build any non-development profile whose
`EXPO_PUBLIC_API_URL` isn't `https://` — release builds block cleartext HTTP,
so a leftover LAN URL would ship an app that can't reach the server.

### Firebase config file

`google-services.json` is gitignored, so upload it as a file variable;
`app.config.js` picks up the path EAS provides:

```bash
npx eas-cli env:create --environment production --type file \
  --name GOOGLE_SERVICES_JSON --value ./google-services.json
```

Repeat with `--environment preview` if you build preview APKs.

## Build

```bash
# In Expo's cloud (free tier has a monthly build quota):
npx eas-cli build --platform android --profile production

# Or on this machine:
JAVA_HOME=~/jdk17 ANDROID_HOME=~/Android/Sdk \
  npx eas-cli build --platform android --profile production --local
```

On the **first** build, let EAS generate the Android keystore. That is your
**upload key**. Download a backup straight away and store it somewhere that
isn't this laptop:

```bash
npx eas-cli credentials --platform android   # → Download credentials
```

`versionCode` is tracked by EAS (`appVersionSource: remote`) and
auto-incremented on every production build, so Play never sees a reused one.
Bump `version` in `app.json` yourself for user-visible releases.

| Profile | Output | Use |
|---|---|---|
| `development` | APK, dev client | Local development against Metro |
| `preview` | APK | Sideload to testers' phones, production API |
| `production` | AAB | Upload to Google Play |

## Upload to Play

1. The **first** AAB must be uploaded by hand in Play Console (Testing →
   Closed testing → Create release). Play won't accept API uploads before
   that.
2. Accept **Play App Signing** when prompted. Google then holds the key that
   signs what users install; the EAS keystore is only the upload key.
3. Copy the **SHA-1 of the app signing key** (Play Console → Test and release
   → App integrity) into the Android OAuth client in Google Cloud Console.
   Without it Google sign-in works in dev builds but fails in store installs.
4. Later uploads can use `npx eas-cli submit --platform android` once a Play
   service-account key is configured.
