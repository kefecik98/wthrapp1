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
import * as Notifications from "expo-notifications";
import { Platform } from "react-native";
import { apiRequest } from "../lib/api";
import { useAuthStore } from "../store/auth";

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
