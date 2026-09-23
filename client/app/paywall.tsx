// Subscription paywall (spec §2: subscription with free trial).
// Lists RevenueCat offering packages; purchase/restore update the
// subscription query. Server stays authoritative via the RC webhook.
//
// Store policy (Google Play subscriptions policy; Apple 3.1.2 later) needs
// the price *per period*, any free trial, how renewal and cancellation work,
// and Terms + Privacy links — all visible before the user taps buy. Removing
// any of that from this screen risks a store rejection.

import { useQuery, useQueryClient } from '@tanstack/react-query';
import { router } from 'expo-router';
import { useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Linking,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
} from 'react-native';
import type { PurchasesPackage } from 'react-native-purchases';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { useSubscription } from '@/src/hooks/useSubscription';
import { config, revenueCatConfigured } from '@/src/lib/config';
import { planTerms } from '@/src/lib/subscriptionTerms';
import {
  getOfferingPackages,
  purchase,
  purchasesReady,
  restore,
} from '@/src/services/purchases';

// What the two tiers actually do, kept in step with the server alert engine
// (server/src/engine/alertEngine.ts) and the locked rows on the preferences
// screen. If the engine's tiering changes, change this copy with it.
const COMPARISON: { feature: string; free: string; premium: string }[] = [
  { feature: 'Weather types', free: 'Rain only', premium: 'Rain, snow, hail, thunder, wind' },
  { feature: 'How often we check', free: 'Every hour', premium: 'Every 5 minutes' },
  { feature: 'Warning time', free: 'Within the hour', premium: 'Your own lead time, 1–60 min' },
  { feature: 'Rain sensitivity', free: 'Any rain', premium: 'Light, moderate or heavy' },
];

// How renewal and cancellation work on each store. Wording follows each
// store's own cancellation path so users can actually find it.
const RENEWAL_TERMS = Platform.select({
  ios:
    'Payment is charged to your Apple ID when you confirm. Subscriptions ' +
    'renew automatically at the price shown unless cancelled at least 24 ' +
    'hours before the end of the current period. Manage or cancel in ' +
    'Settings → your name → Subscriptions.',
  default:
    'Subscriptions renew automatically at the price shown until you cancel. ' +
    'Cancel any time in Google Play → Profile → Payments & subscriptions → ' +
    'Subscriptions; you keep Premium until the end of the period you have ' +
    'paid for. If you cancel during a free trial, you are not charged.',
});

export default function PaywallScreen() {
  const qc = useQueryClient();
  const [busy, setBusy] = useState(false);
  const subscription = useSubscription();
  // The store's own "manage subscription" page. RevenueCat provides it once
  // the user has bought something; null for users who never subscribed.
  const managementUrl = subscription.data?.info.managementURL ?? null;

  const packages = useQuery({
    queryKey: ['offerings'],
    queryFn: getOfferingPackages,
    enabled: purchasesReady(),
  });

  async function buy(pkg: PurchasesPackage) {
    setBusy(true);
    try {
      await purchase(pkg);
      qc.invalidateQueries({ queryKey: ['subscription'] });
      Alert.alert('Subscribed', 'Your subscription is active.');
      router.back();
    } catch (e: any) {
      if (!e?.userCancelled) {
        Alert.alert('Purchase failed', 'Please try again.');
      }
    } finally {
      setBusy(false);
    }
  }

  async function onRestore() {
    setBusy(true);
    try {
      await restore();
      qc.invalidateQueries({ queryKey: ['subscription'] });
      Alert.alert('Restored', 'Purchases restored.');
    } catch {
      Alert.alert('Restore failed', 'Please try again.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <ScrollView contentContainerStyle={styles.container}>
      <ThemedText type="title">WeatherAlert Premium</ThemedText>
      <ThemedText style={styles.lead}>
        Free gives you an hourly heads-up about rain. Premium watches every
        five minutes, covers every kind of weather, and warns you exactly as
        far ahead as you want.
      </ThemedText>

      <ThemedView style={styles.card}>
        <ThemedView style={[styles.compareRow, styles.compareHead]}>
          <ThemedText style={[styles.compareCell, styles.compareFeature]} />
          <ThemedText style={[styles.compareCell, styles.compareHeadText]}>
            Free
          </ThemedText>
          <ThemedText style={[styles.compareCell, styles.compareHeadText]}>
            Premium
          </ThemedText>
        </ThemedView>
        {COMPARISON.map((row) => (
          <ThemedView key={row.feature} style={styles.compareRow}>
            <ThemedText style={[styles.compareCell, styles.compareFeature]}>
              {row.feature}
            </ThemedText>
            <ThemedText style={[styles.compareCell, styles.muted]}>
              {row.free}
            </ThemedText>
            <ThemedText style={[styles.compareCell, styles.comparePremium]}>
              {row.premium}
            </ThemedText>
          </ThemedView>
        ))}
      </ThemedView>

      {!revenueCatConfigured && (
        <ThemedView style={styles.card}>
          <ThemedText>
            Subscriptions are not configured in this build (set the
            EXPO_PUBLIC_REVENUECAT_* keys). See client/.env.example.
          </ThemedText>
        </ThemedView>
      )}

      {revenueCatConfigured && packages.isLoading && (
        <ActivityIndicator size="large" />
      )}

      {packages.data?.map((pkg) => {
        const terms = planTerms(pkg.product);
        return (
          <Pressable
            key={pkg.identifier}
            style={[styles.plan, busy && styles.disabled]}
            disabled={busy}
            onPress={() => buy(pkg)}
          >
            <ThemedText style={styles.planTitle}>
              {pkg.product.title}
            </ThemedText>
            <ThemedText style={styles.planPrice}>{terms.price}</ThemedText>
            {terms.offer && (
              <ThemedText style={styles.planOffer}>{terms.offer}</ThemedText>
            )}
          </Pressable>
        );
      })}

      {revenueCatConfigured && (
        <ThemedText style={styles.fineprint}>{RENEWAL_TERMS}</ThemedText>
      )}

      {subscription.data?.isActive && managementUrl && (
        <Pressable onPress={() => Linking.openURL(managementUrl)}>
          <ThemedText type="link" style={styles.center}>
            Manage or cancel subscription
          </ThemedText>
        </Pressable>
      )}

      <Pressable onPress={onRestore} disabled={busy}>
        <ThemedText type="link" style={styles.center}>
          Restore purchases
        </ThemedText>
      </Pressable>
      <Pressable onPress={() => router.back()} disabled={busy}>
        <ThemedText type="link" style={styles.center}>
          Not now
        </ThemedText>
      </Pressable>

      <ThemedView style={styles.legalRow}>
        <Pressable onPress={() => Linking.openURL(config.legal.termsUrl)}>
          <ThemedText type="link" style={styles.legalLink}>
            Terms of Use
          </ThemedText>
        </Pressable>
        <ThemedText style={styles.muted}>·</ThemedText>
        <Pressable onPress={() => Linking.openURL(config.legal.privacyUrl)}>
          <ThemedText type="link" style={styles.legalLink}>
            Privacy Policy
          </ThemedText>
        </Pressable>
      </ThemedView>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { padding: 20, paddingTop: 64, gap: 14 },
  lead: { opacity: 0.8, marginBottom: 8 },
  muted: { opacity: 0.6 },
  compareRow: { flexDirection: 'row', gap: 8, paddingVertical: 6 },
  compareHead: { borderBottomWidth: 1, borderBottomColor: '#0a7ea433' },
  compareHeadText: { fontWeight: '600' },
  compareCell: { flex: 1, fontSize: 13 },
  compareFeature: { flex: 0.9, fontWeight: '600' },
  comparePremium: { color: '#0a7ea4' },
  card: { borderRadius: 12, padding: 16 },
  plan: {
    borderWidth: 1,
    borderColor: '#0a7ea4',
    borderRadius: 12,
    padding: 16,
    gap: 4,
  },
  planTitle: { fontWeight: '600', fontSize: 16 },
  planPrice: { opacity: 0.8 },
  planOffer: { color: '#2e7d32', fontWeight: '600' },
  fineprint: { fontSize: 12, opacity: 0.6, lineHeight: 17 },
  legalRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    gap: 8,
    marginTop: 4,
  },
  legalLink: { fontSize: 13 },
  disabled: { opacity: 0.6 },
  center: { textAlign: 'center', marginTop: 8 },
});
