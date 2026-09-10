// JWT access + refresh token helpers.
// Access tokens are short-lived and sent on every request.
// Refresh tokens are long-lived and exchanged for a new access token.

import jwt, { SignOptions } from "jsonwebtoken";
import { config } from "../config";

export interface TokenPayload {
  sub: string; // user id
  tv: number; // token version — must match the user's current tokenVersion
}

export interface TokenPair {
  accessToken: string;
  refreshToken: string;
}

export function signTokenPair(userId: string, tokenVersion: number): TokenPair {
  const payload: TokenPayload = { sub: userId, tv: tokenVersion };

  const accessToken = jwt.sign(payload, config.jwt.accessSecret, {
    expiresIn: config.jwt.accessTtl,
  } as SignOptions);

  const refreshToken = jwt.sign(payload, config.jwt.refreshSecret, {
    expiresIn: config.jwt.refreshTtl,
  } as SignOptions);

  return { accessToken, refreshToken };
}

export function verifyAccessToken(token: string): TokenPayload {
  return jwt.verify(token, config.jwt.accessSecret) as TokenPayload;
}

export function verifyRefreshToken(token: string): TokenPayload {
  return jwt.verify(token, config.jwt.refreshSecret) as TokenPayload;
}
