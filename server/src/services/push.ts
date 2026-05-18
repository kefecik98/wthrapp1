// Firebase Cloud Messaging (FCM) push delivery via the Firebase Admin SDK.
// Initialisation is lazy so the API can still boot in environments where
// push credentials are not configured (e.g. local development).

import admin from "firebase-admin";

let initialised = false;

/** Initialise the Firebase Admin app exactly once, if credentials exist. */
function ensureInitialised(): boolean {
  if (initialised) return true;

  // applicationDefault() reads the path in GOOGLE_APPLICATION_CREDENTIALS.
  if (!process.env.GOOGLE_APPLICATION_CREDENTIALS) {
    console.warn(
      "[push] GOOGLE_APPLICATION_CREDENTIALS not set — push disabled",
    );
    return false;
  }

  admin.initializeApp({ credential: admin.credential.applicationDefault() });
  initialised = true;
  return true;
}

export interface PushMessage {
  token: string;
  title: string;
  body: string;
  data?: Record<string, string>;
}

/**
 * Send a single push notification.
 * Returns true on success, false if push is not configured or the send fails.
 */
export async function sendPush(message: PushMessage): Promise<boolean> {
  if (!ensureInitialised()) return false;

  try {
    await admin.messaging().send({
      token: message.token,
      notification: { title: message.title, body: message.body },
      data: message.data,
    });
    return true;
  } catch (err) {
    console.error("[push] send failed:", err);
    return false;
  }
}
