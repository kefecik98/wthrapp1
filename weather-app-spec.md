# WeatherAlert — App Specification & Architecture

## 1. Product Description

A real-time hyperlocal weather alert app targeting people who work outdoors (construction, landscaping, roofing, event staff, agriculture). The app monitors the user's GPS location and sends a configurable advance push notification before a weather event (rain, snow, hail, lightning, etc.) arrives at their exact location.

**Core value proposition:** You are outside working. Your phone is in your pocket. The app alerts you X minutes before weather hits so you can act — not react.

**Business model:** Subscription (monthly/annual), managed via RevenueCat + App Store / Google Play billing.

---

## 2. Key Features

- Real-time GPS location tracking (foreground + background)
- Two tiers: **free** = hourly rain-only alerts ("rain expected within the
  hour"); **paid** = 5-minute cadence, all event types, plus the customization below
- Configurable alert lead time — paid (e.g. 5, 10, 15, 30 minutes before event)
- Configurable event types per user — paid: rain, snow, hail, thunderstorm, high wind
- Configurable intensity thresholds — paid (e.g. only alert for heavy rain, not drizzle)
- Push notifications delivered even when app is closed
- In-app weather display (current conditions + short-term forecast)
- Subscription paywall with free trial option

---

## 3. Tech Stack

### Mobile (Client)
| Layer | Choice | Reason |
|-------|--------|--------|
| Framework | React Native + Expo | Single codebase for iOS + Android, fast iteration |
| Language | TypeScript | Type safety, better tooling |
| Location | `expo-location` | Foreground + background GPS, significant-change mode |
| Push notifications | `expo-notifications` + FCM | System-level delivery, works when app is closed |
| Subscriptions | RevenueCat SDK | Abstracts App Store + Play Store billing |
| HTTP client | Axios or fetch | API calls to backend |
| State management | Zustand or React Query | Lightweight, sufficient for this app |

### Backend
| Layer | Choice | Reason |
|-------|--------|--------|
| Runtime | Node.js | Fast I/O, large ecosystem, easy JSON handling |
| Framework | Fastify | Lower overhead than Express, built-in schema validation |
| Language | TypeScript | Consistent with mobile codebase |
| Cron / scheduler | node-cron | Alert engine scheduling within same process |
| Database | PostgreSQL | Geospatial queries via PostGIS, ACID compliance |
| ORM | Prisma | Type-safe queries, easy migrations |
| Auth | JWT access + refresh (`jsonwebtoken`) | Stateless, scales horizontally |
| Password hashing | `bcryptjs` | Pure-JS, avoids a native build toolchain on the rack |
| Outbound HTTP | Node built-in `fetch` | Tomorrow.io calls; no extra dependency on Node 22 |
| Push delivery | Firebase Admin SDK (FCM) | Free, single API for iOS + Android |

### Infrastructure
| Component | Choice |
|-----------|--------|
| Servers | On-premise Dell PowerEdge rack (15U) |
| OS | Ubuntu Server 24.04 LTS |
| Reverse proxy | Nginx |
| TLS | Let's Encrypt (Certbot) |
| Process manager | PM2 |
| Containerization | Docker + Docker Compose (optional, recommended for isolation) |
| Database hosting | Self-hosted PostgreSQL on same rack |

### External Services
| Service | Purpose | Cost |
|---------|---------|------|
| Tomorrow.io | Weather data + nowcasting API | Free tier → paid |
| FCM (Firebase) | Push notification delivery | Free |
| RevenueCat | Subscription management + webhooks | Free up to $2,500 MRR |
| Apple APNs | iOS push infrastructure (FCM routes through this) | Free |
| App Store Connect | iOS distribution | $99/year |
| Google Play Console | Android distribution | $25 one-time |

---

## 4. System Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                        USER'S PHONE                         │
│                                                             │
│   ┌─────────────────┐        ┌──────────────────────────┐  │
│   │   React Native  │        │  RevenueCat SDK           │  │
│   │   Expo App      │        │  (handles subscription    │  │
│   │                 │        │   paywall + billing)       │  │
│   │  - GPS polling  │        └──────────┬───────────────┘  │
│   │  - weather UI   │                   │                   │
│   │  - push handler │                   │ App Store /       │
│   └────────┬────────┘                   │ Play Store        │
│            │                            │                   │
└────────────┼────────────────────────────┼───────────────────┘
             │ HTTPS                      │ HTTPS (webhooks)
             │                            │
┌────────────▼────────────────────────────▼───────────────────┐
│                  ON-PREMISE RACK (PowerEdge)                 │
│                                                             │
│  ┌──────────────────────────────────────────────────────┐  │
│  │              Node.js / Fastify Process               │  │
│  │                                                      │  │
│  │   REST API                   Alert Engine            │  │
│  │   ─────────                  ─────────────           │  │
│  │   POST /auth/login           node-cron (5 min/1 hr)  │  │
│  │   POST /auth/register        │                       │  │
│  │   PUT  /location             ├─ read active users    │  │
│  │   GET  /weather              ├─ cluster by location  │  │
│  │   PUT  /preferences          ├─ call Tomorrow.io     │  │
│  │   POST /webhooks/revenuecat  ├─ check thresholds     │  │
│  │                              ├─ dedup check          │  │
│  │                              └─ fire FCM push        │  │
│  │                                                      │  │
│  └───────────────────────┬──────────────────────────────┘  │
│                          │                                  │
│  ┌───────────────────────▼──────────────────────────────┐  │
│  │              PostgreSQL Database                     │  │
│  │                                                      │  │
│  │   users          user_locations    user_preferences  │  │
│  │   alert_log      subscriptions                       │  │
│  └──────────────────────────────────────────────────────┘  │
│                                                             │
│  ┌──────────────────────────────────────────────────────┐  │
│  │   Nginx (reverse proxy + TLS termination)            │  │
│  └──────────────────────────────────────────────────────┘  │
│                                                             │
└─────────────────────────────────────────────────────────────┘
             │                           │
             │ API calls                 │ webhook
             ▼                           ▼
        Tomorrow.io               RevenueCat
        (weather data)            (subscription events)

             │ FCM push
             ▼
        Firebase (Google)
             │
             ▼
        User's phone (system notification, app can be closed)
```

---

## 5. Database Schema

```sql
-- Core user record
users
  id              UUID PRIMARY KEY
  email           TEXT UNIQUE NOT NULL
  password_hash   TEXT                  -- nullable: social-only (Apple/Google) accounts have no password
  fcm_token       TEXT                  -- FCM device push token; null until the device registers via PUT /device/token
  provider        TEXT                  -- 'apple' | 'google' for social accounts; null for password accounts
  provider_sub    TEXT                  -- stable provider subject id; UNIQUE (provider, provider_sub)
  created_at      TIMESTAMPTZ DEFAULT now()

-- Subscription state, kept in sync via RevenueCat webhooks
subscriptions
  id                  UUID PRIMARY KEY
  user_id             UUID REFERENCES users(id)
  status              TEXT  -- 'active' | 'cancelled' | 'expired' | 'trial'
  plan                TEXT  -- 'monthly' | 'annual'
  expires_at          TIMESTAMPTZ
  revenuecat_user_id  TEXT
  updated_at          TIMESTAMPTZ

-- Last known location per user, as the CENTRE of its 0.03° grid cell —
-- never an exact GPS position (see §6.2). accuracy_m is always NULL.
user_locations
  user_id     UUID PRIMARY KEY REFERENCES users(id)
  lat         DOUBLE PRECISION NOT NULL
  lng         DOUBLE PRECISION NOT NULL
  accuracy_m  REAL
  updated_at  TIMESTAMPTZ DEFAULT now()

-- Per-user alert configuration
user_preferences
  user_id             UUID PRIMARY KEY REFERENCES users(id)
  alert_lead_min      INTEGER DEFAULT 10        -- minutes before event
  alert_rain          BOOLEAN DEFAULT true
  alert_snow          BOOLEAN DEFAULT true
  alert_hail          BOOLEAN DEFAULT true
  alert_thunder       BOOLEAN DEFAULT true
  alert_wind          BOOLEAN DEFAULT false
  min_rain_intensity  TEXT DEFAULT 'light'      -- 'light' | 'moderate' | 'heavy'
  notifications_on    BOOLEAN DEFAULT true

-- Deduplication log — prevents repeat alerts for the same event
alert_log
  id              UUID PRIMARY KEY
  user_id         UUID REFERENCES users(id)
  event_type      TEXT        -- 'rain' | 'snow' | 'hail' | 'thunder' | 'wind'
  event_start_at  TIMESTAMPTZ -- predicted event start time from Tomorrow.io
  sent_at         TIMESTAMPTZ DEFAULT now()
  UNIQUE (user_id, event_type, event_start_at)
```

---

## 6. Logic & Code Flow

### 6.1 App Startup / Auth Flow

```
App launches
  │
  ├── Has stored JWT?
  │     YES → validate token with backend → load home screen
  │     NO  → show login / register screen
  │
  ├── Has location permission?
  │     NO  → request permission (explain why: required for alerts)
  │
  └── Has notification permission?
        NO  → request permission
```

### 6.2 Location Update Flow (Mobile → Backend)

```
expo-location (background task)
  │
  ├── Foreground: GPS poll every 3 minutes
  └── Background: significant location change (~500m threshold)
        │
        ▼
  Phone snaps the fix to its 0.03° grid cell (~3 km)
        │
        ▼
  PUT /location  { lat, lng }   ← cell centre only
        │
        ▼
  Backend re-snaps (defence in depth) and writes to user_locations
  (upsert on user_id)
```

**Privacy boundary (decided 2026-09-23):** an exact GPS position never
leaves the phone. The app keeps the precise-location permission so the phone
can place itself in the *right* cell (Android's approximate location is only
~1.7 km accurate — too coarse to pick a 3 km cell reliably), but it sends
only the cell centre. 0.03° matches the ~3 km resolution of the forecast
models, so no forecast accuracy is lost, and stays above Google Play's
3 km² "approximate location" line up to ~70° latitude. The grid maths is
`client/src/lib/grid.ts` / `server/src/lib/grid.ts` (identical copies with
shared test vectors).

```typescript
// Mobile: register background location task
TaskManager.defineTask(LOCATION_TASK, async ({ data, error }) => {
  const { locations } = data;
  await api.put('/location', toReportedLocation(locations[0].coords));
});
```

### 6.3 Alert Engine (two tiers: paid every 5 min, free hourly)

The engine runs as **two independent node-cron schedules**, differing in who
they target and how they match:

- **Paid** (`ALERT_ENGINE_CRON`, default every 5 min) — users with an
  `active`/`trial` subscription. Honours each user's enabled event types,
  intensity thresholds, and `alert_lead_min` lead time. This is the flow shown
  below.
- **Free** (`ALERT_ENGINE_FREE_CRON`, default hourly) — everyone else (no
  subscription, or expired/cancelled). **Rain only**, fired for any rain in the
  forecast window ("rain expected within the hour"), ignoring lead time. The
  hourly cadence matches the ~60-minute forecast horizon, so there is no
  coverage gap. Same clustering, dedup, and push path as below.

```
node-cron fires
  │
  ▼
Fetch active users
  SELECT u.id, ul.lat, ul.lng, ul.updated_at, up.*, s.status
  FROM users u
  JOIN user_locations ul ON ul.user_id = u.id
  JOIN user_preferences up ON up.user_id = u.id
  JOIN subscriptions s ON s.user_id = u.id
  WHERE s.status IN ('active', 'trial')
    AND up.notifications_on = true
    AND ul.updated_at > now() - interval '30 minutes'   ← skip stale locations
  │
  ▼
Cluster users by forecast cell (FORECAST_CELL_DEG, default 0.1° ≈ 11 km;
0.03° ≈ 3 km once weather calls are cheap)
  grid_key = centre of the cell containing the user's stored location
  │
  ▼
For each unique grid cell:
  Call Tomorrow.io minutely forecast at the CELL CENTRE
  Cache response for the duration of the cycle (in-memory Map, keyed by grid_key)
  │
  ▼
For each user in that cell:
  Parse Tomorrow.io response
  Find first predicted weather event matching user's alert_rain/snow/hail etc.
  Check: event_start_time - now() <= user.alert_lead_min
  │
  ├── No matching event → skip
  │
  └── Matching event found
        │
        ▼
      Dedup check:
        SELECT 1 FROM alert_log
        WHERE user_id = $1
          AND event_type = $2
          AND event_start_at = $3
        │
        ├── Row exists → already alerted → skip
        │
        └── No row → send alert
              │
              ├── INSERT INTO alert_log (user_id, event_type, event_start_at)
              │
              └── Firebase Admin SDK
                    messaging.send({
                      token: user.fcm_token,
                      notification: {
                        title: "Rain in 10 minutes",
                        body: "Moderate rain expected at your location"
                      },
                      data: { event_type: 'rain', minutes_away: '10' }
                    })
```

### 6.4 Subscription Webhook Flow (RevenueCat → Backend)

```
User subscribes in app
  │
  ▼
RevenueCat processes payment via App Store / Play Store
  │
  ▼
RevenueCat POST /webhooks/revenuecat
  {
    event: 'INITIAL_PURCHASE' | 'RENEWAL' | 'CANCELLATION' | 'EXPIRATION',
    app_user_id: '...',
    ...
  }
  │
  ▼
Backend verifies webhook signature (RevenueCat shared secret)
  │
  ▼
Upsert subscriptions table:
  INITIAL_PURCHASE / RENEWAL → status = 'active', set expires_at
  CANCELLATION               → status = 'cancelled'
  EXPIRATION                 → status = 'expired'
```

### 6.5 Tomorrow.io Query Structure

Tomorrow.io's `/timelines` endpoint (or the newer `/weather/forecast` endpoint) with `minutely` timestep returns precipitation data for the next 60 minutes.

```typescript
// Relevant fields from Tomorrow.io minutely response
interface TomorrowMinute {
  time: string;                // ISO timestamp
  values: {
    precipitationIntensity: number;   // mm/hr
    precipitationType: number;         // 0=none 1=rain 2=snow 3=freezing rain 4=ice pellets (hail)
    precipitationProbability: number;  // 0-100
    windSpeed: number;                 // m/s
    thunderstormProbability: number;   // 0-100
  }
}
```

Threshold logic per user preference:

```typescript
function findNextEvent(minutes: TomorrowMinute[], prefs: UserPreferences) {
  for (const minute of minutes) {
    const v = minute.values;
    const minsAway = (new Date(minute.time).getTime() - Date.now()) / 60000;

    if (prefs.alertRain && v.precipitationType === 1 && v.precipitationIntensity >= intensityThreshold(prefs.minRainIntensity))
      return { type: 'rain', minutesAway: minsAway, startTime: minute.time };

    if (prefs.alertSnow && v.precipitationType === 2)
      return { type: 'snow', minutesAway: minsAway, startTime: minute.time };

    if (prefs.alertHail && v.precipitationType === 4)
      return { type: 'hail', minutesAway: minsAway, startTime: minute.time };

    if (prefs.alertThunder && v.thunderstormProbability > 70)
      return { type: 'thunder', minutesAway: minsAway, startTime: minute.time };

    // 13.9 m/s ≈ 31 mph — lower bound of the US NWS Wind Advisory, the
    // point at which outdoor work (roofing, crane, scaffold) is typically
    // halted. Make this a user preference later if needed.
    if (prefs.alertWind && v.windSpeed >= 13.9)
      return { type: 'wind', minutesAway: minsAway, startTime: minute.time };
  }
  return null;
}
```

---

## 7. Deployment (On-Premise)

```
PowerEdge Rack
  │
  ├── Server 1 (or VM/container on Server 1)
  │     ├── Ubuntu 24.04 LTS
  │     ├── Node.js (PM2 managed)
  │     │     ├── API process  (port 3000)
  │     │     └── (alert engine runs inside same process via node-cron)
  │     ├── Nginx (port 80/443 → proxy to 3000)
  │     └── Certbot (Let's Encrypt TLS)
  │
  └── Server 2 (or separate instance)
        └── PostgreSQL 16
              └── weather_app database
```

**Minimum viable single-server deployment:** Both Node.js and Postgres on the same PowerEdge instance. Separate when load warrants it.

**Domain requirement:** A domain pointing to your rack's public IP, with port 443 forwarded through your router/firewall. Dynamic DNS (e.g. DuckDNS, Cloudflare) if your ISP IP changes.

---

## 8. Open Questions / Next Decisions

1. **Tomorrow.io plan** — which tier to start on; need to estimate call volume based on target initial user count
2. **Mobile auth** — RESOLVED: email/password + Apple + Google. Server
   exposes `POST /auth/register|login|refresh|apple|google`; identity
   tokens are verified server-side and accounts are resolved by the stable
   `(provider, provider_sub)` key (email-link fallback). Remaining: wire
   real Google OAuth client IDs + `APPLE_CLIENT_ID` (config, not code).
3. **FCM token management** — RESOLVED: client re-syncs the device token on
   rotation via `addPushTokenListener` -> `PUT /device/token`.
4. **Free tier definition** — RESOLVED: limited-free. Free users get
   **rain-only** alerts polled **hourly** ("rain expected within the hour").
   Paid (`active`/`trial`) users get **all event types**, a **5-minute** poll
   cadence, and customizable lead time (+ planned custom sound/vibration).
   Implemented server-side as two cron tiers (§6.3); client preference-gating
   + paywall copy still to do.
5. **Background location on iOS** — Apple requires explicit justification for "always on" location permission; App Store review may push back; need a clear user-facing explanation
6. **Alert UI** — deep link from push notification into the app (map view, radar, forecast detail?)
