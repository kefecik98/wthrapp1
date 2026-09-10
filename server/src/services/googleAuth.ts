// Google ID-token verification via the official google-auth-library.
// The client sends the id_token from the Google OAuth flow; the library
// validates the signature, issuer, expiry, and audience for us.

import { OAuth2Client } from "google-auth-library";
import { config } from "../config";
import type { SocialIdentity } from "./appleAuth";

const client = new OAuth2Client();

export async function verifyGoogleToken(
  idToken: string,
): Promise<SocialIdentity> {
  if (config.social.googleClientIds.length === 0) {
    throw new Error("Google sign-in is not configured");
  }

  const ticket = await client.verifyIdToken({
    idToken,
    audience: config.social.googleClientIds,
  });

  const payload = ticket.getPayload();
  if (!payload?.sub) {
    throw new Error("Invalid Google token");
  }

  // Only trust the email if Google has verified it. Creating or linking an
  // account on an unverified address is an account-takeover vector, so an
  // unverified email is dropped (the caller then treats it as "no email").
  const email = payload.email_verified ? payload.email : undefined;
  return { sub: payload.sub, email };
}
