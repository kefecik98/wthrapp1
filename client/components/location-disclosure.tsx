// Background-location "prominent disclosure" (Google Play User Data policy).
//
// Play rejects apps that request ACCESS_BACKGROUND_LOCATION without first
// showing, inside the app, what is collected, that it is collected while the
// app is closed, and why — with an explicit accept action that leads straight
// into the OS permission prompt. This modal is that screen; the Play Console
// background-location declaration video should show it. Keep the wording in
// step with the privacy policy (server/deploy/caddy/legal/privacy.html).

import { Modal, Pressable, ScrollView, StyleSheet } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';

interface Props {
  visible: boolean;
  /** User tapped Continue — go straight to the OS permission request. */
  onAccept: () => void;
  /** User declined — do not request the permission. */
  onDecline: () => void;
}

export function LocationDisclosure({ visible, onAccept, onDecline }: Props) {
  return (
    <Modal
      visible={visible}
      animationType="slide"
      transparent
      onRequestClose={onDecline}
    >
      <ThemedView style={styles.backdrop}>
        <ThemedView style={styles.sheet}>
          <ScrollView contentContainerStyle={styles.content}>
            <ThemedText type="subtitle">Use your location in the background?</ThemedText>

            <ThemedText style={styles.lead}>
              WeatherAlert collects your location to warn you before rain,
              snow, hail, lightning or strong wind reaches where you are —
              even when the app is closed or not in use.
            </ThemedText>

            <ThemedText style={styles.heading}>How it is used</ThemedText>
            <ThemedText style={styles.body}>
              • Your location is sent to our server and used only to check
              the forecast for where you are and to decide when to alert you.
            </ThemedText>
            <ThemedText style={styles.body}>
              • Coordinates are shared with our weather data provider to fetch
              that forecast. They are never sold or used for advertising.
            </ThemedText>
            <ThemedText style={styles.body}>
              • We keep only your most recent location, and delete it when you
              delete your account.
            </ThemedText>

            <ThemedText style={styles.heading}>What happens next</ThemedText>
            <ThemedText style={styles.body}>
              Your phone will ask for location permission. To get alerts while
              the app is closed, choose “Allow all the time”. You can change
              this at any time in your phone’s settings.
            </ThemedText>
          </ScrollView>

          <Pressable style={styles.accept} onPress={onAccept}>
            <ThemedText style={styles.acceptText}>Continue</ThemedText>
          </Pressable>
          <Pressable style={styles.decline} onPress={onDecline}>
            <ThemedText type="link">Not now</ThemedText>
          </Pressable>
        </ThemedView>
      </ThemedView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    justifyContent: 'flex-end',
    backgroundColor: 'rgba(0,0,0,0.4)',
  },
  sheet: {
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
    padding: 20,
    paddingBottom: 32,
    maxHeight: '90%',
    gap: 8,
  },
  content: { gap: 10, paddingBottom: 8 },
  lead: { fontSize: 16, lineHeight: 22 },
  heading: { fontWeight: '600', marginTop: 6 },
  body: { opacity: 0.8, lineHeight: 20 },
  accept: {
    backgroundColor: '#0a7ea4',
    borderRadius: 8,
    paddingVertical: 12,
    alignItems: 'center',
  },
  acceptText: { color: '#fff', fontWeight: '600' },
  decline: { alignItems: 'center', paddingVertical: 8 },
});
