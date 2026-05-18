// Shared React Query client. React Query owns all server-derived data
// (weather, preferences); the Zustand auth store owns session state only.

import { QueryClient } from "@tanstack/react-query";

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      // Weather changes minute to minute; keep it briefly fresh.
      staleTime: 60_000,
      retry: 1,
    },
  },
});
