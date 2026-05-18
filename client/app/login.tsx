// Login / register screen (spec §6.1 auth flow).
// Email/password against the backend, plus Apple/Google sign-in UI.
// On success the auth store sets the session and the root navigator
// (see app/_layout.tsx) swaps to the authenticated tabs automatically.

import * as AppleAuthentication from 'expo-apple-authentication';
import { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Pressable,
  StyleSheet,
  TextInput,
  View,
} from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { useLogin, useRegister, useSocialSignIn } from '@/src/hooks/useAuth';
import { ApiError } from '@/src/lib/api';

type Mode = 'login' | 'register';

export default function LoginScreen() {
  const [mode, setMode] = useState<Mode>('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [appleAvailable, setAppleAvailable] = useState(false);

  const login = useLogin();
  const register = useRegister();
  const social = useSocialSignIn();

  const credential = mode === 'login' ? login : register;
  const busy = login.isPending || register.isPending || social.isPending;

  // Apple sign-in is only offered where the OS supports it (iOS 13+).
  useEffect(() => {
    AppleAuthentication.isAvailableAsync().then(setAppleAvailable);
  }, []);

  function submit() {
    if (!email.trim() || !password) {
      Alert.alert('Missing details', 'Enter your email and password.');
      return;
    }
    credential.mutate(
      { email: email.trim(), password },
      {
        onError: (e) =>
          Alert.alert(
            'Sign-in failed',
            e instanceof ApiError ? e.message : 'Something went wrong.',
          ),
      },
    );
  }

  async function onApple() {
    try {
      const cred = await AppleAuthentication.signInAsync({
        requestedScopes: [
          AppleAuthentication.AppleAuthenticationScope.EMAIL,
          AppleAuthentication.AppleAuthenticationScope.FULL_NAME,
        ],
      });
      if (!cred.identityToken) return;
      social.mutate(
        { provider: 'apple', idToken: cred.identityToken },
        {
          onError: () =>
            Alert.alert(
              'Apple sign-in unavailable',
              'The backend does not yet support Apple sign-in (POST /auth/apple). See client/CONTEXT.md.',
            ),
        },
      );
    } catch (e: any) {
      if (e?.code !== 'ERR_REQUEST_CANCELED') {
        Alert.alert('Apple sign-in failed', 'Please try again.');
      }
    }
  }

  function onGoogle() {
    // Google sign-in needs OAuth client IDs + a backend endpoint; neither
    // exists yet. Surface that clearly rather than faking a flow.
    Alert.alert(
      'Google sign-in unavailable',
      'Google sign-in is not wired up yet (needs OAuth config + POST /auth/google). See client/CONTEXT.md.',
    );
  }

  return (
    <ThemedView style={styles.container}>
      <ThemedText type="title" style={styles.title}>
        WeatherAlert
      </ThemedText>
      <ThemedText style={styles.tagline}>
        Get warned before the weather hits.
      </ThemedText>

      <TextInput
        style={styles.input}
        placeholder="Email"
        autoCapitalize="none"
        keyboardType="email-address"
        value={email}
        onChangeText={setEmail}
        editable={!busy}
      />
      <TextInput
        style={styles.input}
        placeholder="Password"
        secureTextEntry
        value={password}
        onChangeText={setPassword}
        editable={!busy}
      />

      <Pressable
        style={[styles.primaryBtn, busy && styles.disabled]}
        onPress={submit}
        disabled={busy}
      >
        {busy ? (
          <ActivityIndicator color="#fff" />
        ) : (
          <ThemedText style={styles.primaryBtnText}>
            {mode === 'login' ? 'Sign in' : 'Create account'}
          </ThemedText>
        )}
      </Pressable>

      <Pressable
        onPress={() => setMode(mode === 'login' ? 'register' : 'login')}
        disabled={busy}
      >
        <ThemedText type="link" style={styles.switch}>
          {mode === 'login'
            ? 'New here? Create an account'
            : 'Have an account? Sign in'}
        </ThemedText>
      </Pressable>

      <View style={styles.divider}>
        <View style={styles.line} />
        <ThemedText style={styles.or}>or</ThemedText>
        <View style={styles.line} />
      </View>

      {appleAvailable && (
        <AppleAuthentication.AppleAuthenticationButton
          buttonType={
            AppleAuthentication.AppleAuthenticationButtonType.SIGN_IN
          }
          buttonStyle={
            AppleAuthentication.AppleAuthenticationButtonStyle.BLACK
          }
          cornerRadius={8}
          style={styles.appleBtn}
          onPress={onApple}
        />
      )}

      <Pressable style={styles.googleBtn} onPress={onGoogle} disabled={busy}>
        <ThemedText style={styles.googleBtnText}>
          Continue with Google
        </ThemedText>
      </Pressable>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: 24, justifyContent: 'center', gap: 12 },
  title: { textAlign: 'center' },
  tagline: { textAlign: 'center', marginBottom: 16, opacity: 0.7 },
  input: {
    borderWidth: 1,
    borderColor: '#ccc',
    borderRadius: 8,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 16,
    backgroundColor: '#fff',
    color: '#000',
  },
  primaryBtn: {
    backgroundColor: '#0a7ea4',
    borderRadius: 8,
    paddingVertical: 14,
    alignItems: 'center',
    marginTop: 4,
  },
  primaryBtnText: { color: '#fff', fontWeight: '600', fontSize: 16 },
  disabled: { opacity: 0.6 },
  switch: { textAlign: 'center', marginTop: 4 },
  divider: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginVertical: 8,
  },
  line: { flex: 1, height: 1, backgroundColor: '#ccc' },
  or: { opacity: 0.6 },
  appleBtn: { height: 48 },
  googleBtn: {
    borderWidth: 1,
    borderColor: '#ccc',
    borderRadius: 8,
    paddingVertical: 13,
    alignItems: 'center',
    backgroundColor: '#fff',
  },
  googleBtnText: { color: '#000', fontWeight: '600', fontSize: 16 },
});
