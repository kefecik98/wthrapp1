// Thin REST client for the WeatherAlert backend.
// - Attaches the Bearer access token to every request.
// - On a 401 it tries the refresh token once (POST /auth/refresh); if that
//   also fails the session is cleared so the UI returns to the login flow.

import { config } from "./config";
import { useAuthStore } from "../store/auth";

export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}

interface RequestOptions {
  method?: string;
  body?: unknown;
  auth?: boolean; // default true — send the access token
}

async function raw(
  path: string,
  token: string | null,
  options: RequestOptions,
): Promise<Response> {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
  };
  if (options.auth !== false && token) {
    headers.Authorization = `Bearer ${token}`;
  }

  return fetch(`${config.apiBaseUrl}${path}`, {
    method: options.method ?? "GET",
    headers,
    body: options.body ? JSON.stringify(options.body) : undefined,
  });
}

/** Exchange the refresh token for a new pair. Returns the new access token. */
async function tryRefresh(): Promise<string | null> {
  const { refreshToken, setSession, signOut } = useAuthStore.getState();
  if (!refreshToken) return null;

  const res = await raw("/auth/refresh", null, {
    method: "POST",
    auth: false,
    body: { refreshToken },
  });

  if (!res.ok) {
    await signOut();
    return null;
  }

  const tokens = (await res.json()) as {
    accessToken: string;
    refreshToken: string;
  };
  await setSession(tokens);
  return tokens.accessToken;
}

/** Make an API request and parse the JSON body (or null for 204). */
export async function apiRequest<T>(
  path: string,
  options: RequestOptions = {},
): Promise<T> {
  const token = useAuthStore.getState().accessToken;
  let res = await raw(path, token, options);

  // One transparent retry after refreshing an expired access token.
  if (res.status === 401 && options.auth !== false) {
    const fresh = await tryRefresh();
    if (fresh) res = await raw(path, fresh, options);
  }

  if (!res.ok) {
    const message = await res.text().catch(() => res.statusText);
    throw new ApiError(res.status, message || res.statusText);
  }

  if (res.status === 204) return null as T;
  return (await res.json()) as T;
}
