// Minimal JWT payload reader — just enough to pull our user id (`sub`)
// out of the access token so RevenueCat can be keyed to the same id the
// backend's webhook expects (app_user_id === our user id).

export function decodeJwtSub(token: string | null): string | null {
  if (!token) return null;
  const part = token.split(".")[1];
  if (!part) return null;
  try {
    const b64 = part.replace(/-/g, "+").replace(/_/g, "/");
    const decode = (globalThis as { atob?: (s: string) => string }).atob;
    const json = decode?.(b64);
    if (!json) return null;
    const payload = JSON.parse(json) as { sub?: string };
    return payload.sub ?? null;
  } catch {
    return null;
  }
}
