// "Sign in with Apple" identity-token verification.
// The client sends the identityToken from expo-apple-authentication; we
// verify it is genuinely signed by Apple, intended for this app, and not
// expired, then extract the stable user id and email.

import jwt, { JwtHeader, SigningKeyCallback } from "jsonwebtoken";
import jwksClient from "jwks-rsa";
import { config } from "../config";

const APPLE_ISSUER = "https://appleid.apple.com";

const keys = jwksClient({
  jwksUri: "https://appleid.apple.com/auth/keys",
  cache: true,
  rateLimit: true,
});

// jsonwebtoken calls this to resolve the public key for the token's `kid`.
function getKey(header: JwtHeader, callback: SigningKeyCallback): void {
  keys
    .getSigningKey(header.kid)
    .then((key) => callback(null, key.getPublicKey()))
    .catch((err) => callback(err as Error));
}

export interface SocialIdentity {
  sub: string;
  email?: string;
}

export async function verifyAppleToken(
  idToken: string,
): Promise<SocialIdentity> {
  if (!config.social.appleClientId) {
    throw new Error("Apple sign-in is not configured");
  }

  const payload = await new Promise<jwt.JwtPayload>((resolve, reject) => {
    jwt.verify(
      idToken,
      getKey,
      {
        algorithms: ["RS256"],
        issuer: APPLE_ISSUER,
        audience: config.social.appleClientId,
      },
      (err, decoded) => {
        if (err || !decoded || typeof decoded === "string") {
          reject(err ?? new Error("Invalid Apple token"));
        } else {
          resolve(decoded);
        }
      },
    );
  });

  // Apple sends email_verified as the string "true" (sometimes boolean true).
  // Only trust a verified address — creating or linking an account on an
  // unverified email is an account-takeover vector.
  const emailVerified =
    payload.email_verified === true || payload.email_verified === "true";
  return {
    sub: String(payload.sub),
    email:
      emailVerified && typeof payload.email === "string"
        ? payload.email
        : undefined,
  };
}
