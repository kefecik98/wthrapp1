// Client runtime configuration.
// Expo inlines any EXPO_PUBLIC_* env var at build time, so the API base
// URL can be set per environment without code changes.

export const config = {
  // e.g. https://api.weatheralert.example — see client/.env.example
  apiBaseUrl: process.env.EXPO_PUBLIC_API_URL ?? "http://localhost:3000",
} as const;
