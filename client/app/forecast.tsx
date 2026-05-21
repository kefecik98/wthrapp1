// Forecast detail (spec §8.6 deep-link target).
// Opened when the user taps a weather alert notification; shows what is
// coming and the next-hour forecast.

import { router, useLocalSearchParams } from 'expo-router';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { useWeather } from '@/src/hooks/useWeather';

const LABEL: Record<string, string> = {
  rain: 'Rain',
  snow: 'Snow',
  hail: 'Hail',
  thunder: 'Thunderstorm',
  wind: 'High wind',
};

export default function ForecastScreen() {
  const { event_type, minutes_away } = useLocalSearchParams<{
    event_type?: string;
    minutes_away?: string;
  }>();
  const weather = useWeather();

  const label = event_type ? (LABEL[event_type] ?? event_type) : 'Weather';

  return (
    <ScrollView contentContainerStyle={styles.container}>
      <ThemedText type="title">{label} incoming</ThemedText>
      {minutes_away != null && (
        <ThemedText style={styles.lead}>
          Expected in about {minutes_away} minute
          {minutes_away === '1' ? '' : 's'} at your location.
        </ThemedText>
      )}

      <ThemedView style={styles.card}>
        <ThemedText type="subtitle">Next 60 minutes</ThemedText>
        {weather.isLoading && <ThemedText>Loading…</ThemedText>}
        {weather.isError && (
          <ThemedText>Forecast unavailable right now.</ThemedText>
        )}
        {weather.data?.minutely.slice(0, 12).map((m) => (
          <View key={m.time} style={styles.row}>
            <ThemedText>
              {new Date(m.time).toLocaleTimeString([], {
                hour: '2-digit',
                minute: '2-digit',
              })}
            </ThemedText>
            <ThemedText>
              {m.values.precipitationType
                ? `${m.values.precipitationIntensity.toFixed(1)} mm/hr`
                : 'Clear'}
            </ThemedText>
          </View>
        ))}
      </ThemedView>

      <Pressable style={styles.close} onPress={() => router.back()}>
        <ThemedText type="link">Close</ThemedText>
      </Pressable>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { padding: 20, paddingTop: 64, gap: 16 },
  lead: { opacity: 0.8 },
  card: { borderRadius: 12, padding: 16, gap: 10 },
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 4,
  },
  close: { alignItems: 'center', marginTop: 8 },
});
