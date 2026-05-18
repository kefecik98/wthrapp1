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
import { apiRequest } from "../lib/api";

export async function registerForPush(): Promise<boolean> {
  if (!Device.isDevice) return false; // simulators have no push token

  const existing = await Notifications.getPermissionsAsync();
  let status = existing.status;
  if (status !== "granted") {
    status = (await Notifications.requestPermissionsAsync()).status;
  }
  if (status !== "granted") return false;

  const { data: fcmToken } = await Notifications.getDevicePushTokenAsync();

  await apiRequest<null>("/device/token", {
    method: "PUT",
    body: { fcmToken: String(fcmToken) },
  });
  return true;
}
