// Home screen (spec §6.1 permissions + in-app weather display).
// Prompts for location/notification permission with a clear rationale,
// then shows the short-term forecast for the user's location.

import { useQueryClient } from '@tanstack/react-query';
import * as Location from 'expo-location';
import { useState } from 'react';
import { Alert, Pressable, ScrollView, StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { router } from 'expo-router';
import { useDeleteAccount, useSignOut } from '@/src/hooks/useAuth';
import { useSubscription } from '@/src/hooks/useSubscription';
import { useWeather } from '@/src/hooks/useWeather';
import { apiRequest } from '@/src/lib/api';
import { registerForPush } from '@/src/services/push';
import { startLocationUpdates } from '@/src/services/location';

const PRECIP: Record<number, string> = {
  0: 'Clear',
  1: 'Rain',
  2: 'Snow',
  3: 'Freezing rain',
  4: 'Hail',
};

export default function HomeScreen() {
  const weather = useWeather();
  const signOut = useSignOut();
  const deleteAccount = useDeleteAccount();
  const subscription = useSubscription();
  const qc = useQueryClient();
  const [locOn, setLocOn] = useState(false);
  const [pushOn, setPushOn] = useState(false);

  async function enableLocation() {
    const ok = await startLocationUpdates();
    if (!ok) {
      Alert.alert(
        'Location needed',
        'WeatherAlert needs background location to warn you about weather at your exact spot. Enable it in Settings.',
      );
      return;
    }
    setLocOn(true);
    // Post one fix immediately so the forecast works without waiting for
    // the next background update.
    const pos = await Location.getCurrentPositionAsync({});
    await apiRequest('/location', {
      method: 'PUT',
      body: {
        lat: pos.coords.latitude,
        lng: pos.coords.longitude,
        accuracy: pos.coords.accuracy ?? undefined,
      },
    });
    qc.invalidateQueries({ queryKey: ['weather'] });
  }

  async function enablePush() {
    const ok = await registerForPush();
    setPushOn(ok);
    if (!ok) {
      Alert.alert(
        'Notifications off',
        'Without notifications we cannot alert you before weather hits.',
      );
    }
  }

  // Two-step confirmation before the irreversible delete. On success the
  // mutation clears the session, which sends the app back to the login flow.
  function confirmDeleteAccount() {
    Alert.alert(
      'Delete account?',
      'This permanently deletes your account and all your data — location, ' +
        'preferences, and alert history. This cannot be undone.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: () =>
            deleteAccount.mutate(undefined, {
              onError: () =>
                Alert.alert(
                  'Could not delete account',
                  'Something went wrong. Please try again.',
                ),
            }),
        },
      ],
    );
  }

  return (
    <ScrollView contentContainerStyle={styles.container}>
      <ThemedText type="title">Your weather</ThemedText>

      <ThemedView style={styles.card}>
        <ThemedText type="subtitle">Setup</ThemedText>
        <Pressable
          style={[styles.btn, locOn && styles.btnDone]}
          onPress={enableLocation}
        >
          <ThemedText style={styles.btnText}>
            {locOn ? '✓ Location alerts on' : 'Enable location alerts'}
          </ThemedText>
        </Pressable>
        <Pressable
          style={[styles.btn, pushOn && styles.btnDone]}
          onPress={enablePush}
        >
          <ThemedText style={styles.btnText}>
            {pushOn ? '✓ Notifications on' : 'Enable notifications'}
          </ThemedText>
        </Pressable>
      </ThemedView>

      <ThemedView style={styles.card}>
        <ThemedText type="subtitle">Next 60 minutes</ThemedText>
        {weather.isLoading && <ThemedText>Loading forecast…</ThemedText>}
        {weather.isError && (
          <ThemedText>
            No forecast yet. Enable location alerts above to start.
          </ThemedText>
        )}
        {weather.data && (
          <>
            <ThemedText style={styles.muted}>
              Updated {new Date(weather.data.updatedAt).toLocaleTimeString()}
            </ThemedText>
            {weather.data.minutely.slice(0, 12).map((m) => {
              const type = PRECIP[m.values.precipitationType] ?? '—';
              return (
                <View key={m.time} style={styles.row}>
                  <ThemedText>
                    {new Date(m.time).toLocaleTimeString([], {
                      hour: '2-digit',
                      minute: '2-digit',
                    })}
                  </ThemedText>
                  <ThemedText>
                    {type}
                    {m.values.precipitationType
                      ? `  ${m.values.precipitationIntensity.toFixed(1)} mm/hr`
                      : ''}
                  </ThemedText>
                </View>
              );
            })}
          </>
        )}
      </ThemedView>

      <ThemedView style={styles.card}>
        <ThemedText type="subtitle">Subscription</ThemedText>
        <ThemedText style={styles.muted}>
          {subscription.data?.isActive
            ? 'Premium active — alerts enabled.'
            : 'Not subscribed. Alerts require a subscription.'}
        </ThemedText>
        <Pressable style={styles.btn} onPress={() => router.push('/paywall')}>
          <ThemedText style={styles.btnText}>
            {subscription.data?.isActive
              ? 'Manage subscription'
              : 'Subscribe'}
          </ThemedText>
        </Pressable>
      </ThemedView>

      <Pressable style={styles.signOut} onPress={() => signOut()}>
        <ThemedText type="link">Sign out</ThemedText>
      </Pressable>

      <Pressable
        style={styles.deleteAccount}
        onPress={confirmDeleteAccount}
        disabled={deleteAccount.isPending}
      >
        <ThemedText style={styles.deleteText}>
          {deleteAccount.isPending ? 'Deleting…' : 'Delete account'}
        </ThemedText>
      </Pressable>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { padding: 20, paddingTop: 64, gap: 16 },
  card: { borderRadius: 12, padding: 16, gap: 10 },
  btn: {
    backgroundColor: '#0a7ea4',
    borderRadius: 8,
    paddingVertical: 12,
    alignItems: 'center',
  },
  btnDone: { backgroundColor: '#2e7d32' },
  btnText: { color: '#fff', fontWeight: '600' },
  muted: { opacity: 0.6 },
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 4,
  },
  signOut: { alignItems: 'center', marginTop: 8 },
  deleteAccount: { alignItems: 'center', marginTop: 4, paddingVertical: 8 },
  deleteText: { color: '#c0392b', fontWeight: '600' },
});
