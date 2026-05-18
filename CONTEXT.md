

# WeatherAlert — App Specification & Architecture

## What we are building

### 1. Product Description

A real-time hyperlocal weather alert app targeting people who work outdoors (construction, landscaping, roofing, event staff, agriculture). The app monitors the user's GPS location and sends a configurable advance push notification before a weather event (rain, snow, hail, lightning, etc.) arrives at their exact location.

**Core value proposition:** You are outside working. Your phone is in your pocket. The app alerts you X minutes before weather hits so you can act — not react.

**Business model:** Subscription (monthly/annual), managed via RevenueCat + App Store / Google Play billing.

---

### 2. Key Features

- Real-time GPS location tracking (foreground + background)
- Configurable alert lead time (e.g. 5, 10, 15, 30 minutes before event)
- Configurable event types per user: rain, snow, hail, thunderstorm, high wind
- Configurable intensity thresholds (e.g. only alert for heavy rain, not drizzle)
- Push notifications delivered even when app is closed
- In-app weather display (current conditions + short-term forecast)
- Subscription paywall with free trial option

---

### 3. Tech Stack

#### Mobile (Client)
| Layer | Choice | Reason |
|-------|--------|--------|
| Framework | React Native + Expo | Single codebase for iOS + Android, fast iteration |
| Language | TypeScript | Type safety, better tooling |
| Location | `expo-location` | Foreground + background GPS, significant-change mode |
| Push notifications | `expo-notifications` + FCM | System-level delivery, works when app is closed |
| Subscriptions | RevenueCat SDK | Abstracts App Store + Play Store billing |
| HTTP client | Axios or fetch | API calls to backend |
| State management | Zustand or React Query | Lightweight, sufficient for this app |

#### Backend
| Layer | Choice | Reason |
|-------|--------|--------|
| Runtime | Node.js | Fast I/O, large ecosystem, easy JSON handling |
| Framework | Fastify | Lower overhead than Express, built-in schema validation |
| Language | TypeScript | Consistent with mobile codebase |
| Cron / scheduler | node-cron | Alert engine scheduling within same process |
| Database | PostgreSQL | Geospatial queries via PostGIS, ACID compliance |
| ORM | Prisma | Type-safe queries, easy migrations |
| Auth | JWT (access + refresh tokens) | Stateless, scales horizontally |
| Push delivery | Firebase Admin SDK (FCM) | Free, single API for iOS + Android |

#### Infrastructure
| Component | Choice |
|-----------|--------|
| Servers | On-premise Dell PowerEdge rack (15U) |
| OS | Ubuntu Server 24.04 LTS |
| Reverse proxy | Nginx |
| TLS | Let's Encrypt (Certbot) |
| Process manager | PM2 |
| Containerization | Docker + Docker Compose (optional, recommended for isolation) |
| Database hosting | Self-hosted PostgreSQL on same rack |

#### External Services
| Service | Purpose | Cost |
|---------|---------|------|
| Tomorrow.io | Weather data + nowcasting API | Free tier → paid |
| FCM (Firebase) | Push notification delivery | Free |
| RevenueCat | Subscription management + webhooks | Free up to $2,500 MRR |
| Apple APNs | iOS push infrastructure (FCM routes through this) | Free |
| App Store Connect | iOS distribution | $99/year |
| Google Play Console | Android distribution | $25 one-time |

## What good looks like
- Clear, concise, professional code that is commented.
- The client side code can be compiled to work on both IOS and Android devices.

## What to avoid
- Long, convoluted, unprofessional, uncommented code.
