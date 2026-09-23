// Push registration (spec §6.1 permission step + §3 FCM delivery).
// Obtains the native device push token and registers it with the backend
// via PUT /device/token, which the alert engine then targets.
//
// NOTE / open item (spec §8 "FCM token management"): the backend sends via
// the Firebase Admin SDK, which expects an FCM registration token. On
// Android getDevicePushTokenAsync() returns exactly that. On iOS it returns
// the raw APNs token — delivering to it through FCM requires the app to be
// wired to Firebase (google-services / GoogleService-Info) so FCM can map
// APNs -> FCM. Tracked as an integration follow-up, not solved by scaffold.

import * as Device from "expo-device";
import * as Haptics from "expo-haptics";
import * as Notifications from "expo-notifications";
import { Platform } from "react-native";
import { apiRequest } from "../lib/api";
import { useAuthStore } from "../store/auth";

// Android delivers weather alerts on this dedicated, high-importance channel.
// The id MUST match the channelId the server stamps on the FCM payload
// (server/src/services/push.ts) — otherwise Android falls back to a default
// channel and the vibration/importance below are ignored.
export const WEATHER_ALERT_CHANNEL_ID = "weather-alerts";

// Distinctive buzz so a weather warning feels unlike an ordinary notification:
// two short pulses then a long one. Pattern is [wait, vibrate, wait, vibrate…].
const ALERT_VIBRATION_PATTERN = [0, 300, 150, 300, 150, 600];

/**
 * Create the weather-alert notification channel (Android only; no-op elsewhere).
 * Must exist before any alert arrives. Safe to call repeatedly, but note
 * Android locks a channel's sound + importance after first creation — changing
 * them later needs a new channel id or an app reinstall.
 */
export async function ensureAndroidChannelAsync(): Promise<void> {
  if (Platform.OS !== "android") return;
  await Notifications.setNotificationChannelAsync(WEATHER_ALERT_CHANNEL_ID, {
    name: "Weather alerts",
    importance: Notifications.AndroidImportance.MAX, // heads-up banner + sound
    sound: "default",
    vibrationPattern: ALERT_VIBRATION_PATTERN,
    enableVibrate: true,
    enableLights: true,
    lightColor: "#0a7ea4",
  });
}

/**
 * Fire a haptic when an alert lands while the app is foregrounded. The OS
 * vibrates for background/tray notifications via the channel above; this covers
 * the in-app case, where the system shows nothing and so wouldn't vibrate.
 */
export function registerForegroundHaptics(): Notifications.Subscription {
  return Notifications.addNotificationReceivedListener(() => {
    void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
  });
}

// Show alerts even when the app is foregrounded (this is time-critical
// weather, not marketing) — set once at module load.
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowBanner: true,
    shouldShowList: true,
    shouldPlaySound: true,
    shouldSetBadge: false,
  }),
});

// Data payload the alert engine attaches (server engine/alertEngine.ts).
export interface AlertNavParams {
  event_type?: string;
  minutes_away?: string;
  // Index signature so these pass straight into expo-router typed params.
  [key: string]: string | undefined;
}

// Push the latest token to the backend (no-op when signed out).
async function syncToken(token: string): Promise<void> {
  if (!useAuthStore.getState().accessToken) return;
  try {
    await apiRequest<null>("/device/token", {
      method: "PUT",
      body: { fcmToken: token },
    });
  } catch {
    // Best-effort; the next registration/rotation will retry.
  }
}

export async function registerForPush(): Promise<boolean> {
  // iOS simulators cannot obtain a push token, but Android emulators with
  // Google Play Services can — so only bail on the iOS simulator.
  if (!Device.isDevice && Platform.OS === "ios") return false;

  // Ensure the channel exists before the first alert can arrive.
  await ensureAndroidChannelAsync();

  const existing = await Notifications.getPermissionsAsync();
  let status = existing.status;
  if (status !== "granted") {
    status = (await Notifications.requestPermissionsAsync()).status;
  }
  if (status !== "granted") return false;

  const { data: fcmToken } = await Notifications.getDevicePushTokenAsync();
  await syncToken(String(fcmToken));
  return true;
}

// The OS can rotate the device push token at any time. Subscribe so the
// backend always has the current token (spec §8 "FCM token management").
// Call once at app start; remove the returned subscription on teardown.
export function registerPushTokenListener(): Notifications.Subscription {
  return Notifications.addPushTokenListener((token) => {
    void syncToken(String(token.data));
  });
}

// Fired when the user taps an alert while the app is running.
export function registerNotificationResponseListener(
  onTap: (params: AlertNavParams) => void,
): Notifications.Subscription {
  return Notifications.addNotificationResponseReceivedListener((response) => {
    onTap(response.notification.request.content.data as AlertNavParams);
  });
}

// The alert that cold-started the app, if any (deep-link on launch).
export async function getInitialNotificationParams(): Promise<AlertNavParams | null> {
  const last = await Notifications.getLastNotificationResponseAsync();
  return last
    ? (last.notification.request.content.data as AlertNavParams)
    : null;
}
