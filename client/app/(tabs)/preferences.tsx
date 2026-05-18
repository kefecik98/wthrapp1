// Preferences screen (spec §6: per-user alert configuration).
// Reads/writes via the React Query hooks; each change is persisted
// immediately with an optimistic-free PUT /preferences.

import { ScrollView, StyleSheet, Switch, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
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

const LEAD_TIMES = [5, 10, 15, 30];
const INTENSITIES: Preferences['minRainIntensity'][] = [
  'light',
  'moderate',
  'heavy',
];

export default function PreferencesScreen() {
  const prefs = usePreferences();
  const update = useUpdatePreferences();

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

      <ThemedView style={styles.card}>
        <ThemedText type="subtitle">Notify me about</ThemedText>
        {EVENT_TOGGLES.map(({ key, label }) => (
          <View key={key} style={styles.row}>
            <ThemedText>{label}</ThemedText>
            <Switch
              value={p[key] as boolean}
              onValueChange={(v) => set(key, v as Preferences[typeof key])}
            />
          </View>
        ))}
      </ThemedView>

      <ThemedView style={styles.card}>
        <ThemedText type="subtitle">Warn me this far ahead</ThemedText>
        <View style={styles.chips}>
          {LEAD_TIMES.map((min) => (
            <Chip
              key={min}
              label={`${min} min`}
              active={p.alertLeadMin === min}
              onPress={() => set('alertLeadMin', min)}
            />
          ))}
        </View>
      </ThemedView>

      <ThemedView style={styles.card}>
        <ThemedText type="subtitle">Minimum rain intensity</ThemedText>
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
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
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
