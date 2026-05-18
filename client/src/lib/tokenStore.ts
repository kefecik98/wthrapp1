// Secure persistence for the JWT pair.
// Tokens are stored in the device keychain/keystore via expo-secure-store
// so they survive app restarts and are not readable by other apps.
// Kept as a standalone module because the background location task runs
// outside React and needs to read the access token too.

import * as SecureStore from "expo-secure-store";

const ACCESS_KEY = "wa.accessToken";
const REFRESH_KEY = "wa.refreshToken";

export interface StoredTokens {
  accessToken: string;
  refreshToken: string;
}

export async function saveTokens(tokens: StoredTokens): Promise<void> {
  await SecureStore.setItemAsync(ACCESS_KEY, tokens.accessToken);
  await SecureStore.setItemAsync(REFRESH_KEY, tokens.refreshToken);
}

export async function loadTokens(): Promise<StoredTokens | null> {
  const accessToken = await SecureStore.getItemAsync(ACCESS_KEY);
  const refreshToken = await SecureStore.getItemAsync(REFRESH_KEY);
  if (!accessToken || !refreshToken) return null;
  return { accessToken, refreshToken };
}

export async function clearTokens(): Promise<void> {
  await SecureStore.deleteItemAsync(ACCESS_KEY);
  await SecureStore.deleteItemAsync(REFRESH_KEY);
}
