import React, { useEffect, useState } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { useAuth } from '../auth/AuthContext.jsx';
import { useRiderJobs } from '../api/riderHooks.js';
import { useOutbox } from '../offline/OutboxContext.jsx';
import { registerForPushNotifications, unregisterPushNotifications } from '../push/registerForPush.js';
import { isTrackingActive } from '../location/backgroundLocation.js';
import { colors, type, layout, card } from '../theme.js';
import { Banner, Card, Chip, DangerButton, GhostButton, KeyValue, TopBar } from '../components/ui.jsx';

/** Human wording for why push registration did not complete. */
const PUSH_REASONS = {
  not_a_physical_device: 'Push notifications need a physical device.',
  permission_denied: 'Notifications are turned off for this app.',
  missing_eas_project_id: 'This build has no EAS project id, so no push token can be issued.',
  no_token_issued: 'The push service did not issue a token.',
  error: 'Push registration failed.',
};

export default function ProfileScreen() {
  const { user, signOut } = useAuth();
  const { data } = useRiderJobs();
  const { pending, isOnline } = useOutbox();

  const [push, setPush] = useState(null);
  const [tracking, setTracking] = useState(false);
  const [signingOut, setSigningOut] = useState(false);

  useEffect(() => {
    registerForPushNotifications().then(setPush);
    isTrackingActive().then(setTracking).catch(() => {});
  }, []);

  async function handleSignOut() {
    setSigningOut(true);
    // Clear the device token first: a signed-out phone must not keep receiving
    // job assignments for a rider who is no longer on it.
    await unregisterPushNotifications();
    await signOut();
  }

  return (
    <View style={layout.screen} testID="screen-profile">
      <TopBar>
        <Text style={type.screenTitle}>Profile</Text>
      </TopBar>

      {!isOnline ? <Banner tone="amber" text="Offline" /> : null}

      <ScrollView contentContainerStyle={layout.scrollBody}>
        <Card style={[card.padded, styles.card]} testID="card-profile">
          <KeyValue label="Name" value={user?.name || '—'} />
          <KeyValue label="Account handle" value={user?.accountHandle || '—'} />
          <KeyValue label="Role" value={user?.role === 'rider' ? 'Phlebotomist' : user?.role || '—'} />
        </Card>

        <Card style={[card.padded, styles.card]} testID="card-shift">
          <Text style={styles.heading}>Shift</Text>
          <View style={styles.chipRow}>
            <Chip
              label={
                data?.rider?.status === 'assigned'
                  ? 'On a job'
                  : data?.rider?.status === 'available'
                    ? 'Available'
                    : 'Offline'
              }
              tone={data?.rider?.status === 'assigned' ? 'blue' : data?.rider?.status === 'available' ? 'green' : 'grey'}
            />
            <Chip
              label={tracking ? 'Location sharing on' : 'Location sharing off'}
              tone={tracking ? 'blue' : 'grey'}
            />
          </View>
          <Text style={type.bodyMuted}>
            Your location is shared with the patient only while you are on an active collection, and stops when the job
            ends.
          </Text>
        </Card>

        <Card style={[card.padded, styles.card]} testID="card-sync">
          <Text style={styles.heading}>Sync</Text>
          <KeyValue label="Pending updates" value={String(pending)} testID="kv-pending" />
          <KeyValue
            label="Push notifications"
            value={push?.registered ? 'On' : PUSH_REASONS[push?.reason] || 'Not registered'}
            testID="kv-push"
          />
          {!push?.registered && push?.reason === 'permission_denied' ? (
            <GhostButton
              testID="btn-retry-push"
              label="Try enabling notifications"
              onPress={() => registerForPushNotifications().then(setPush)}
            />
          ) : null}
        </Card>

        <DangerButton
          testID="btn-signout"
          label={signingOut ? 'Signing out…' : 'Sign out'}
          onPress={handleSignOut}
          disabled={signingOut}
        />
        {pending > 0 ? (
          <Text style={styles.warning} testID="signout-warning">
            {pending} update{pending === 1 ? '' : 's'} still waiting to sync. Stay signed in until they send, or they
            will not reach the lab.
          </Text>
        ) : null}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  card: { marginBottom: 14, gap: 4 },
  heading: { ...type.label, color: colors.muted, textTransform: 'uppercase', letterSpacing: 0.6, marginBottom: 10 },
  chipRow: { flexDirection: 'row', gap: 8, marginBottom: 10, flexWrap: 'wrap' },
  warning: { ...type.meta, color: colors.amberDark, textAlign: 'center', marginTop: 12, fontWeight: '700' },
});
