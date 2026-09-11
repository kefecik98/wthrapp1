// Subscription paywall (spec §2: subscription with free trial).
// Lists RevenueCat offering packages; purchase/restore update the
// subscription query. Server stays authoritative via the RC webhook.

import { useQuery, useQueryClient } from '@tanstack/react-query';
import { router } from 'expo-router';
import { useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Pressable,
  ScrollView,
  StyleSheet,
} from 'react-native';
import type { PurchasesPackage } from 'react-native-purchases';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { revenueCatConfigured } from '@/src/lib/config';
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

export default function PaywallScreen() {
  const qc = useQueryClient();
  const [busy, setBusy] = useState(false);

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

      {packages.data?.map((pkg) => (
        <Pressable
          key={pkg.identifier}
          style={[styles.plan, busy && styles.disabled]}
          disabled={busy}
          onPress={() => buy(pkg)}
        >
          <ThemedText style={styles.planTitle}>
            {pkg.product.title}
          </ThemedText>
          <ThemedText style={styles.planPrice}>
            {pkg.product.priceString}
          </ThemedText>
        </Pressable>
      ))}

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
  disabled: { opacity: 0.6 },
  center: { textAlign: 'center', marginTop: 8 },
});
