// Subscription status from RevenueCat (client-side view). The backend
// remains authoritative via the RevenueCat webhook; this drives UI gating.

import { useQuery } from "@tanstack/react-query";
import {
  getCustomerInfo,
  hasActiveSubscription,
  purchasesReady,
} from "../services/purchases";

export function useSubscription() {
  return useQuery({
    queryKey: ["subscription"],
    queryFn: getCustomerInfo,
    enabled: purchasesReady(),
    select: (info) => ({ info, isActive: hasActiveSubscription(info) }),
  });
}
