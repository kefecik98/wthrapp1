// App-wide providers + startup hydration.
// Wraps the tree in React Query and, on mount, restores the persisted
// session from secure storage (App Startup / Auth flow, spec §6.1).

import { QueryClientProvider } from "@tanstack/react-query";
import { PropsWithChildren, useEffect } from "react";
import { queryClient } from "./lib/queryClient";
import { useAuthStore } from "./store/auth";

export function Providers({ children }: PropsWithChildren) {
  const hydrate = useAuthStore((s) => s.hydrate);

  useEffect(() => {
    void hydrate();
  }, [hydrate]);

  return (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );
}
