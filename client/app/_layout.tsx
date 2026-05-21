import { DarkTheme, DefaultTheme, ThemeProvider } from '@react-navigation/native';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { ActivityIndicator, View } from 'react-native';
import 'react-native-reanimated';

import { useColorScheme } from '@/hooks/use-color-scheme';
import { Providers } from '@/src/Providers';
import { useAuthStore } from '@/src/store/auth';

export const unstable_settings = {
  anchor: '(tabs)',
};

// App Startup / Auth flow (spec §6.1): wait for the persisted session to
// load, then route to the app (authenticated) or the login screen.
function RootNavigator() {
  const hydrating = useAuthStore((s) => s.hydrating);
  const isAuthed = useAuthStore((s) => s.accessToken !== null);

  if (hydrating) {
    return (
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
        <ActivityIndicator size="large" />
      </View>
    );
  }

  return (
    <Stack screenOptions={{ headerShown: false }}>
      <Stack.Protected guard={isAuthed}>
        <Stack.Screen name="(tabs)" />
        <Stack.Screen
          name="forecast"
          options={{ presentation: 'modal', title: 'Forecast' }}
        />
        <Stack.Screen
          name="paywall"
          options={{ presentation: 'modal', title: 'Premium' }}
        />
      </Stack.Protected>
      <Stack.Protected guard={!isAuthed}>
        <Stack.Screen name="login" />
      </Stack.Protected>
    </Stack>
  );
}

export default function RootLayout() {
  const colorScheme = useColorScheme();

  return (
    <Providers>
      <ThemeProvider value={colorScheme === 'dark' ? DarkTheme : DefaultTheme}>
        <RootNavigator />
        <StatusBar style="auto" />
      </ThemeProvider>
    </Providers>
  );
}
