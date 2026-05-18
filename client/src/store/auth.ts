// Auth/session store (Zustand).
// Holds the in-memory token pair and mirrors it to secure storage.
// React Query owns server data; this store owns only session state.

import { create } from "zustand";
import {
  StoredTokens,
  clearTokens,
  loadTokens,
  saveTokens,
} from "../lib/tokenStore";

interface AuthState {
  accessToken: string | null;
  refreshToken: string | null;
  // True until the initial secure-storage read completes (App Startup flow).
  hydrating: boolean;
  isAuthenticated: () => boolean;
  hydrate: () => Promise<void>;
  setSession: (tokens: StoredTokens) => Promise<void>;
  signOut: () => Promise<void>;
}

export const useAuthStore = create<AuthState>((set, get) => ({
  accessToken: null,
  refreshToken: null,
  hydrating: true,

  isAuthenticated: () => get().accessToken !== null,

  hydrate: async () => {
    const tokens = await loadTokens();
    set({
      accessToken: tokens?.accessToken ?? null,
      refreshToken: tokens?.refreshToken ?? null,
      hydrating: false,
    });
  },

  setSession: async (tokens) => {
    await saveTokens(tokens);
    set({
      accessToken: tokens.accessToken,
      refreshToken: tokens.refreshToken,
    });
  },

  signOut: async () => {
    await clearTokens();
    set({ accessToken: null, refreshToken: null });
  },
}));
