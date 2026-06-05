// App-wide providers + startup hydration.
// Wraps the tree in React Query and, on mount, restores the persisted
// session from secure storage (App Startup / Auth flow, spec §6.1).

import { QueryClientProvider } from "@tanstack/react-query";
import { router } from "expo-router";
import { PropsWithChildren, useEffect } from "react";
import { queryClient } from "./lib/queryClient";
import { decodeJwtSub } from "./lib/jwt";
import { configurePurchases } from "./services/purchases";
import {
  ensureAndroidChannelAsync,
  getInitialNotificationParams,
  registerForegroundHaptics,
  registerNotificationResponseListener,
  registerPushTokenListener,
} from "./services/push";
import { useAuthStore } from "./store/auth";

export function Providers({ children }: PropsWithChildren) {
  const hydrate = useAuthStore((s) => s.hydrate);
  const accessToken = useAuthStore((s) => s.accessToken);

  useEffect(() => {
    void hydrate();
  }, [hydrate]);

  // Configure RevenueCat keyed to our user id (matches the RC webhook's
  // app_user_id), once we have a session.
  useEffect(() => {
    if (accessToken) configurePurchases(decodeJwtSub(accessToken));
  }, [accessToken]);

  // Keep the backend's FCM token current if the OS rotates it. Also create the
  // Android alert channel up front and buzz on foreground alerts.
  useEffect(() => {
    void ensureAndroidChannelAsync();
    const tokenSub = registerPushTokenListener();
    const hapticSub = registerForegroundHaptics();
    return () => {
      tokenSub.remove();
      hapticSub.remove();
    };
  }, []);

  // Deep-link a tapped weather alert to the forecast detail screen,
  // including the case where the alert cold-started the app.
  useEffect(() => {
    const sub = registerNotificationResponseListener((params) => {
      router.push({ pathname: "/forecast", params });
    });
    void getInitialNotificationParams().then((params) => {
      if (params) router.push({ pathname: "/forecast", params });
    });
    return () => sub.remove();
  }, []);

  return (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );
}
