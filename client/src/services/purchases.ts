// RevenueCat (subscriptions) wrapper.
// The SDK is configured with our user id as the RevenueCat appUserID so
// the backend's RevenueCat webhook (which keys on app_user_id) maps the
// purchase to the right account. Server remains the source of truth for
// subscription state; this is the in-app purchase/paywall surface.

import { Platform } from "react-native";
import Purchases, {
  CustomerInfo,
  PurchasesPackage,
} from "react-native-purchases";
import { config, revenueCatConfigured } from "../lib/config";

let configured = false;

export function configurePurchases(appUserId: string | null): void {
  if (configured || !revenueCatConfigured) return;
  const apiKey =
    Platform.OS === "ios"
      ? config.revenueCat.iosKey
      : config.revenueCat.androidKey;
  if (!apiKey) return;

  Purchases.configure({ apiKey, appUserID: appUserId ?? undefined });
  configured = true;
}

export const purchasesReady = (): boolean => configured;

export async function getOfferingPackages(): Promise<PurchasesPackage[]> {
  const offerings = await Purchases.getOfferings();
  return offerings.current?.availablePackages ?? [];
}

export async function purchase(
  pkg: PurchasesPackage,
): Promise<CustomerInfo> {
  const { customerInfo } = await Purchases.purchasePackage(pkg);
  return customerInfo;
}

export function restore(): Promise<CustomerInfo> {
  return Purchases.restorePurchases();
}

export function getCustomerInfo(): Promise<CustomerInfo> {
  return Purchases.getCustomerInfo();
}

export function hasActiveSubscription(info: CustomerInfo): boolean {
  return Object.keys(info.entitlements.active).length > 0;
}
