// Unit tests for the auth store. expo-secure-store is mocked globally in
// jest.setup.js with an in-memory Map.

import * as SecureStore from "expo-secure-store";
import { useAuthStore } from "./auth";

// Defined in jest.setup.js — clears the in-memory keychain.
interface MockedStore {
  __resetStore: () => void;
}

beforeEach(async () => {
  (SecureStore as unknown as MockedStore).__resetStore();
  // Reset zustand state directly so per-test starts clean.
  useAuthStore.setState({
    accessToken: null,
    refreshToken: null,
    hydrating: true,
  });
});

describe("useAuthStore", () => {
  it("starts unauthenticated, hydrating", () => {
    const s = useAuthStore.getState();
    expect(s.accessToken).toBeNull();
    expect(s.refreshToken).toBeNull();
    expect(s.hydrating).toBe(true);
    expect(s.isAuthenticated()).toBe(false);
  });

  it("hydrate loads stored tokens and clears `hydrating`", async () => {
    await SecureStore.setItemAsync("wa.accessToken", "stored-access");
    await SecureStore.setItemAsync("wa.refreshToken", "stored-refresh");

    await useAuthStore.getState().hydrate();

    const s = useAuthStore.getState();
    expect(s.accessToken).toBe("stored-access");
    expect(s.refreshToken).toBe("stored-refresh");
    expect(s.hydrating).toBe(false);
    expect(s.isAuthenticated()).toBe(true);
  });

  it("hydrate clears `hydrating` even when no tokens are stored", async () => {
    await useAuthStore.getState().hydrate();
    const s = useAuthStore.getState();
    expect(s.accessToken).toBeNull();
    expect(s.hydrating).toBe(false);
  });

  it("setSession persists to secure storage and sets state", async () => {
    await useAuthStore.getState().setSession({
      accessToken: "new-a",
      refreshToken: "new-r",
    });
    expect(useAuthStore.getState().accessToken).toBe("new-a");
    expect(await SecureStore.getItemAsync("wa.accessToken")).toBe("new-a");
    expect(await SecureStore.getItemAsync("wa.refreshToken")).toBe("new-r");
  });

  it("signOut wipes both in-memory state and secure storage", async () => {
    await useAuthStore.getState().setSession({
      accessToken: "a",
      refreshToken: "r",
    });
    await useAuthStore.getState().signOut();
    expect(useAuthStore.getState().accessToken).toBeNull();
    expect(useAuthStore.getState().refreshToken).toBeNull();
    expect(await SecureStore.getItemAsync("wa.accessToken")).toBeNull();
    expect(await SecureStore.getItemAsync("wa.refreshToken")).toBeNull();
  });
});
