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
        Real-time alerts before weather hits your exact location.
      </ThemedText>

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
