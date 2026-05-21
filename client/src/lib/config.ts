// Client runtime configuration.
// Expo inlines any EXPO_PUBLIC_* env var at build time, so the API base
// URL can be set per environment without code changes.

export const config = {
  // e.g. https://api.weatheralert.example — see client/.env.example
  apiBaseUrl: process.env.EXPO_PUBLIC_API_URL ?? "http://localhost:3000",

  // Google OAuth client IDs (from Google Cloud Console). Empty until
  // configured — when empty the Google button shows an informative alert.
  google: {
    iosClientId: process.env.EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID ?? "",
    androidClientId: process.env.EXPO_PUBLIC_GOOGLE_ANDROID_CLIENT_ID ?? "",
    webClientId: process.env.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID ?? "",
  },

  // RevenueCat public SDK keys (one per platform). Empty disables the
  // paywall flow (the screen shows an informative message).
  revenueCat: {
    iosKey: process.env.EXPO_PUBLIC_REVENUECAT_IOS_KEY ?? "",
    androidKey: process.env.EXPO_PUBLIC_REVENUECAT_ANDROID_KEY ?? "",
  },
} as const;

export const googleConfigured =
  config.google.iosClientId !== "" ||
  config.google.androidClientId !== "" ||
  config.google.webClientId !== "";

export const revenueCatConfigured =
  config.revenueCat.iosKey !== "" || config.revenueCat.androidKey !== "";
