// Preferences screen (spec §6: per-user alert configuration).
// Reads/writes via the React Query hooks; each change is persisted
// immediately with an optimistic-free PUT /preferences.
//
// Tiering mirrors the server alert engine exactly (see
// server/src/engine/alertEngine.ts):
//
//   free — rain only, hourly poll, fixed "within the hour" lead time and
//          light intensity. The engine ignores this user's event-type,
//          intensity and lead-time preferences entirely, so showing those
//          controls as editable would be a lie: they are rendered locked and
//          route to the paywall instead.
//   paid — every control below is live.
//
// `notificationsOn` is the one setting the engine honours on both tiers, so
// it stays editable for everyone.

import Slider from '@react-native-community/slider';
import { router } from 'expo-router';
import { useEffect, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Switch, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import {
  MAX_LEAD,
  MIN_LEAD,
  minutesToPosition,
  positionToMinutes,
} from '@/src/lib/leadTime';
import { useSubscription } from '@/src/hooks/useSubscription';
import {
  Preferences,
  usePreferences,
  useUpdatePreferences,
} from '@/src/hooks/useWeather';

const EVENT_TOGGLES: { key: keyof Preferences; label: string }[] = [
  { key: 'alertRain', label: 'Rain' },
  { key: 'alertSnow', label: 'Snow' },
  { key: 'alertHail', label: 'Hail' },
  { key: 'alertThunder', label: 'Thunderstorm' },
  { key: 'alertWind', label: 'High wind' },
];

const INTENSITIES: Preferences['minRainIntensity'][] = [
  'light',
  'moderate',
  'heavy',
];

export default function PreferencesScreen() {
  const prefs = usePreferences();
  const update = useUpdatePreferences();
  const subscription = useSubscription();

  // No active entitlement (or RevenueCat not configured in this build) means
  // the server treats this account as free — match that here.
  const isPaid = subscription.data?.isActive === true;

  // Live lead-time value shown while dragging the slider, before it's saved.
  // Kept in sync with the persisted value whenever preferences (re)load.
  const [liveLead, setLiveLead] = useState<number | null>(null);
  useEffect(() => {
    if (prefs.data) setLiveLead(prefs.data.alertLeadMin);
  }, [prefs.data]);

  function set<K extends keyof Preferences>(key: K, value: Preferences[K]) {
    update.mutate({ [key]: value } as Partial<Preferences>);
  }

  if (prefs.isLoading) {
    return (
      <ThemedView style={styles.center}>
        <ThemedText>Loading preferences…</ThemedText>
      </ThemedView>
    );
  }
  if (prefs.isError || !prefs.data) {
    return (
      <ThemedView style={styles.center}>
        <ThemedText>Could not load preferences.</ThemedText>
      </ThemedView>
    );
  }

  const p = prefs.data;

  return (
    <ScrollView contentContainerStyle={styles.container}>
      <ThemedText type="title">Alert settings</ThemedText>

      {!isPaid && <FreePlanBanner />}

      <ThemedView style={styles.card}>
        <ThemedText type="subtitle">Notify me about</ThemedText>

        {isPaid ? (
          EVENT_TOGGLES.map(({ key, label }) => (
            <View key={key} style={styles.row}>
              <ThemedText>{label}</ThemedText>
              <Switch
                value={p[key] as boolean}
                onValueChange={(v) => set(key, v as Preferences[typeof key])}
              />
            </View>
          ))
        ) : (
          <>
            {/* Rain is what the free tier actually sends, so show it as a
                fact rather than a switch the engine would ignore. */}
            <View style={styles.row}>
              <ThemedText>Rain</ThemedText>
              <ThemedText style={styles.included}>Included</ThemedText>
            </View>
            {EVENT_TOGGLES.filter((e) => e.key !== 'alertRain').map(
              ({ key, label }) => (
                <LockedRow key={key} label={label} />
              ),
            )}
          </>
        )}
      </ThemedView>

      <ThemedView style={styles.card}>
        <View style={styles.row}>
          <ThemedText type="subtitle">Warn me this far ahead</ThemedText>
          {isPaid && (
            <ThemedText type="defaultSemiBold">
              {liveLead ?? p.alertLeadMin} min
            </ThemedText>
          )}
        </View>

        {isPaid ? (
          <>
            <Slider
              // The track is a plain 0..1; leadTime.ts maps position <-> minutes
              // so the first 15 min occupy the left half (fine 1-min steps) and
              // 15-60 min the right half (5-min steps). Persist on drag end.
              minimumValue={0}
              maximumValue={1}
              value={minutesToPosition(p.alertLeadMin)}
              onValueChange={(pos) => setLiveLead(positionToMinutes(pos))}
              onSlidingComplete={(pos) =>
                set('alertLeadMin', positionToMinutes(pos))
              }
              minimumTrackTintColor="#0a7ea4"
              maximumTrackTintColor="#ccc"
              thumbTintColor="#0a7ea4"
            />
            <View style={styles.row}>
              <ThemedText style={styles.muted}>{MIN_LEAD} min</ThemedText>
              <ThemedText style={styles.muted}>{MAX_LEAD} min</ThemedText>
            </View>
          </>
        ) : (
          <LockedRow
            label="Within the hour"
            note="Premium warns you a set number of minutes ahead."
          />
        )}
      </ThemedView>

      <ThemedView style={styles.card}>
        <ThemedText type="subtitle">Minimum rain intensity</ThemedText>
        {isPaid ? (
          <View style={styles.chips}>
            {INTENSITIES.map((level) => (
              <Chip
                key={level}
                label={level}
                active={p.minRainIntensity === level}
                onPress={() => set('minRainIntensity', level)}
              />
            ))}
          </View>
        ) : (
          <LockedRow
            label="Any rain"
            note="Premium lets you ignore light drizzle."
          />
        )}
      </ThemedView>

      <ThemedView style={styles.card}>
        <View style={styles.row}>
          <ThemedText type="subtitle">All notifications</ThemedText>
          <Switch
            value={p.notificationsOn}
            onValueChange={(v) => set('notificationsOn', v)}
          />
        </View>
      </ThemedView>
    </ScrollView>
  );
}

/** Header shown to free users: what they get now, and what upgrading adds. */
function FreePlanBanner() {
  return (
    <ThemedView style={[styles.card, styles.banner]}>
      <ThemedText type="subtitle">You&apos;re on the free plan</ThemedText>
      <ThemedText style={styles.muted}>
        Rain alerts only, checked once an hour: &ldquo;rain expected within the
        hour&rdquo;. Premium checks every 5 minutes and alerts you on snow,
        hail, thunderstorms and high wind — with your own lead time.
      </ThemedText>
      <Pressable style={styles.btn} onPress={() => router.push('/paywall')}>
        <ThemedText style={styles.btnText}>See Premium</ThemedText>
      </Pressable>
    </ThemedView>
  );
}

/**
 * A setting the free tier doesn't have. Tapping it goes to the paywall
 * rather than silently doing nothing.
 */
function LockedRow({ label, note }: { label: string; note?: string }) {
  return (
    <Pressable onPress={() => router.push('/paywall')}>
      <View style={styles.row}>
        <ThemedText style={styles.lockedLabel}>{label}</ThemedText>
        <ThemedText style={styles.lockTag}>🔒 Premium</ThemedText>
      </View>
      {note && <ThemedText style={styles.muted}>{note}</ThemedText>}
    </Pressable>
  );
}

function Chip({
  label,
  active,
  onPress,
}: {
  label: string;
  active: boolean;
  onPress: () => void;
}) {
  return (
    <ThemedText
      onPress={onPress}
      style={[styles.chip, active && styles.chipActive]}
    >
      {label}
    </ThemedText>
  );
}

const styles = StyleSheet.create({
  container: { padding: 20, paddingTop: 64, gap: 16 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  card: { borderRadius: 12, padding: 16, gap: 12 },
  banner: { borderWidth: 1, borderColor: '#0a7ea4' },
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  muted: { opacity: 0.6 },
  included: { opacity: 0.6 },
  lockedLabel: { opacity: 0.5 },
  lockTag: { opacity: 0.9, fontSize: 12, color: '#0a7ea4' },
  btn: {
    backgroundColor: '#0a7ea4',
    borderRadius: 8,
    paddingVertical: 12,
    alignItems: 'center',
  },
  btnText: { color: '#fff', fontWeight: '600' },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: {
    borderWidth: 1,
    borderColor: '#0a7ea4',
    borderRadius: 16,
    paddingHorizontal: 14,
    paddingVertical: 6,
    overflow: 'hidden',
    textTransform: 'capitalize',
  },
  chipActive: { backgroundColor: '#0a7ea4', color: '#fff' },
});
