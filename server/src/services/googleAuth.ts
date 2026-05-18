// Google ID-token verification via the official google-auth-library.
// The client sends the id_token from the Google OAuth flow; the library
// validates the signature, issuer, expiry, and audience for us.

import { OAuth2Client } from "google-auth-library";
import { config } from "../config";
import { SocialIdentity } from "./appleAuth";

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

  return { sub: payload.sub, email: payload.email };
}
