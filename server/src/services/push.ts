// Firebase Cloud Messaging (FCM) push delivery via the Firebase Admin SDK.
// Initialisation is lazy so the API can still boot in environments where
// push credentials are not configured (e.g. local development).

import admin from "firebase-admin";

let initialised = false;

// Bound how long a single FCM send may take. Firebase Admin's own retry/timeout
// can run long; without this cap a stuck send would stall an alert cycle.
const SEND_TIMEOUT_MS = 10_000;

/** Reject if `promise` does not settle within `ms`. The timer is unref'd so it
 *  never keeps a one-shot process (e.g. trigger_cycle) alive. */
function withTimeout<T>(promise: Promise<T>, ms: number, label: string): Promise<T> {
  return Promise.race([
    promise,
    new Promise<T>((_, reject) => {
      const t = setTimeout(
        () => reject(new Error(`${label} timed out after ${ms}ms`)),
        ms,
      );
      t.unref?.();
    }),
  ]);
}

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
    await withTimeout(
      admin.messaging().send({
        token: message.token,
        notification: { title: message.title, body: message.body },
        data: message.data,
      }),
      SEND_TIMEOUT_MS,
      "[push] send",
    );
    return true;
  } catch (err) {
    console.error("[push] send failed:", err);
    return false;
  }
}
