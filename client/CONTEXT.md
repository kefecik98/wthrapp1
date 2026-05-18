# Client — Context & Architecture

## What this is

The WeatherAlert mobile app: the user-facing client that tracks GPS
location, shows current/short-term weather, manages the subscription
paywall, and receives push notifications fired by the backend. Built from
`../weather-app-spec.md` (the authoritative spec).

## Status

**Scaffolded + core screens built.** Generated with the official
`create-expo-app` default template (Expo SDK 54, expo-router, TypeScript),
then the integration layer and core screens were added. `npx tsc --noEmit`
passes. Not yet run against a simulator/device in this environment — UI
behaviour is unverified. The paywall is still TODO.

## Stack (spec §3, now resolved)

| Layer            | Choice                          | Notes                                    |
|------------------|---------------------------------|------------------------------------------|
| Framework        | React Native + Expo (SDK 54)    | expo-router, one codebase iOS + Android  |
| Language         | TypeScript                      | strict; `@/*` path alias -> repo root    |
| Location         | `expo-location` + `expo-task-manager` | Foreground poll + ~500 m background change |
| Push             | `expo-notifications`            | Native device token -> backend (FCM)     |
| Server data      | `@tanstack/react-query`         | weather, preferences, auth mutations     |
| Session state    | `zustand` + `expo-secure-store` | token pair persisted in the keychain     |
| Subscriptions    | RevenueCat SDK                  | **not yet added** — paywall is TODO      |

## Added integration layer (`src/`)

```
src/
  lib/
    config.ts        API base URL from EXPO_PUBLIC_API_URL
    tokenStore.ts    secure JWT persistence (also read by bg task)
    api.ts           fetch wrapper: Bearer auth + 401 refresh-once
    queryClient.ts   shared React Query client
  store/
    auth.ts          Zustand session store (hydrate/setSession/signOut)
  services/
    location.ts      background location task -> PUT /location
    push.ts          device push token -> PUT /device/token
  hooks/
    useAuth.ts       useRegister / useLogin / useSocialSignIn / useSignOut
    useWeather.ts    useWeather / usePreferences / useUpdatePreferences
  Providers.tsx      QueryClientProvider + startup session hydration
```

## Screens (`app/`, expo-router)

```
app/
  _layout.tsx          Providers + auth gate: Stack.Protected routes
                       (tabs) when authed, login when not; splash while
                       the session hydrates (spec §6.1)
  login.tsx            email/password (login+register) + Apple/Google UI
  (tabs)/
    _layout.tsx        Home + Alerts tabs
    index.tsx          Home: permission prompts + 60-min forecast + sign-out
    preferences.tsx    event toggles, lead time, rain intensity, notifs
```

## Social auth — SERVER WORK REQUIRED

The login screen has Apple (real `expo-apple-authentication` button on
iOS) and Google buttons, but the backend does **not** implement them yet.
To finish social auth:

- Backend: add `POST /auth/apple` and `POST /auth/google` that verify the
  provider identity token, find-or-create the user, and return a JWT pair.
- DB/spec: make `users.password_hash` nullable for social-only accounts.
- Google: add OAuth client IDs + an `expo-auth-session` flow (the button
  currently shows a "not wired up" alert; Apple calls the missing endpoint
  and surfaces a clear message on 404).

## Running

```
cp .env.example .env          # point EXPO_PUBLIC_API_URL at the backend
npm install
npx expo start                # then press a/i, or scan with Expo Go
```

## Key flows the client must implement (spec §6.1–6.2)

- **Startup/auth:** check stored JWT -> validate -> home, else login/register;
  then request location and notification permissions (explain *why*).
- **Location reporting:** foreground GPS every ~3 min; background on
  significant change (~500 m) -> `PUT /location`.
- **Weather display:** `GET /weather` for current conditions + short forecast.
- **Preferences:** `GET`/`PUT /preferences` for alert types, lead time,
  intensity thresholds.
- **Push handling:** receive FCM notifications, deep-link into the app.
- **Subscription:** RevenueCat paywall + free-trial flow.

## Backend it talks to

The Fastify API in `../server/` (see `../server/CONTEXT.md`). All
authenticated requests send `Authorization: Bearer <accessToken>`; use the
refresh token against `POST /auth/refresh` when the access token expires.

## Open client-side questions (spec §8)

- iOS "always on" location justification for App Store review
- iOS push token: `getDevicePushTokenAsync()` returns the APNs token on
  iOS, but the backend delivers via Firebase Admin (FCM). The app must be
  wired to Firebase (google-services / GoogleService-Info) so FCM can map
  APNs -> FCM. Documented in `src/services/push.ts`; integration TODO.
- Auth method: email/password only vs. adding Apple/Google Sign-In
- Push deep-link target (map / radar / forecast detail)
- RevenueCat SDK + paywall not yet added (subscription flow TODO)

## Code conventions

Clear, concise, professional, **commented** code. Must build and behave
correctly on both iOS and Android — verify platform differences (permissions,
background tasks, push) on both before considering a feature done.
