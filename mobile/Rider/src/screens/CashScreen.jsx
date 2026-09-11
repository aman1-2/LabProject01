import React, { useState } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { confirmCashReceived } from '@pathcare/api';
import { useInvalidateJobs } from '../api/riderHooks.js';
import { useOutbox } from '../offline/OutboxContext.jsx';
import { colors, type, layout, card } from '../theme.js';
import { Banner, Card, GhostButton, PrimaryButton, ScreenHeader } from '../components/ui.jsx';
import { BigAction, BigNumber } from '../components/bigAction.jsx';
import { formatCurrency } from '../lib/format.js';

/**
 * Cash confirmation.
 *
 * The amount displayed comes from the booking the server sent, and NO amount is
 * sent back: the server records `booking.amount` regardless of what a client
 * says, so a tampered or stale client value cannot change what is billed
 * (CONTEXT §3.4 — prices are never client-supplied).
 *
 * The rider is confirming money that is already in their hand, so this is
 * deliberately a two-step action: a mis-tap here marks a booking paid that
 * nobody paid for, and the reconciliation happens days later.
 */
export default function CashScreen({ navigation, route }) {
  const { bookingId, amount } = route.params ?? {};
  const invalidateJobs = useInvalidateJobs();
  const { enqueue, isOnline } = useOutbox();

  const [armed, setArmed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const [done, setDone] = useState(null);

  async function confirm() {
    setBusy(true);
    setError(null);
    try {
      await confirmCashReceived(bookingId, {});
      await invalidateJobs();
      setDone({ queued: false });
    } catch (err) {
      if (err?.isNetworkError) {
        // The rider is holding the cash. Not recording it because the radio
        // dropped is the worse failure: the booking stays unpaid and the money
        // is unaccounted for.
        await enqueue({ kind: 'cash', bookingId, payload: {}, label: 'Cash received' });
        setDone({ queued: true });
      } else if (err?.code === 'ALREADY_CONFIRMED') {
        // A previous attempt landed after all.
        await invalidateJobs();
        setDone({ queued: false, already: true });
      } else {
        setError(err?.message || 'Could not confirm the payment.');
      }
    } finally {
      setBusy(false);
    }
  }

  if (done) {
    return (
      <View style={layout.screen} testID="screen-cash-done">
        <ScreenHeader title="Payment" onBack={() => navigation.navigate('JobDetail', { bookingId })} />
        <ScrollView contentContainerStyle={layout.scrollBody}>
          <Card style={[card.padded, styles.card]}>
            <Text style={type.sectionTitle}>
              {done.queued ? 'Saved on this device' : done.already ? 'Already confirmed' : 'Payment confirmed'}
            </Text>
            <Text style={type.bodyMuted}>
              {done.queued
                ? 'You are offline. This confirmation is saved and will be sent when you reconnect. Do not collect the amount again.'
                : done.already
                  ? 'This payment was already recorded. Nothing further is owed.'
                  : `${formatCurrency(amount)} recorded against this booking.`}
            </Text>
          </Card>
          <PrimaryButton
            testID="btn-cash-done"
            label="Back to job"
            onPress={() => navigation.navigate('JobDetail', { bookingId })}
          />
        </ScrollView>
      </View>
    );
  }

  return (
    <View style={layout.screen} testID="screen-cash">
      <ScreenHeader title="Confirm cash" onBack={navigation.goBack} />
      {!isOnline ? <Banner tone="amber" text="Offline — this will be saved and sent when you reconnect." /> : null}
      {error ? <Banner tone="red" text={error} testID="cash-error" /> : null}

      <ScrollView contentContainerStyle={layout.scrollBody}>
        {/* The amount is the whole point of this screen, so it is the whole
            of this card. Digits are legible to a rider who reads words
            slowly, which is exactly why the number is the largest element and
            the explanation sits under it. */}
        <Card style={[card.padded, styles.card]} testID="card-cash-amount">
          <BigNumber
            testID="text-cash-amount"
            value={formatCurrency(amount)}
            caption="Take this much cash from the patient"
            tone="money"
          />
          <Text style={[type.bodyMuted, styles.countHint]}>
            Count it before you confirm. This marks the booking paid and cannot be undone here.
          </Text>
        </Card>

        {armed ? (
          <>
            <Banner
              testID="banner-cash-arm"
              tone="amber"
              text={`You are confirming ${formatCurrency(amount)} received in cash.`}
            />
            {/* Two taps, never one: money is irreversible from this app, and a
                single button here is a pocket-tap away from marking a booking
                paid that was not. */}
            <BigAction
              testID="btn-cash-confirm-final"
              icon="check"
              label="Yes, I have it"
              hint={`${formatCurrency(amount)} received`}
              tone="go"
              onPress={confirm}
              loading={busy}
            />
            <GhostButton testID="btn-cash-cancel" label="No, go back" onPress={() => setArmed(false)} />
          </>
        ) : (
          <BigAction
            testID="btn-cash-arm"
            icon="wallet"
            label="Cash received"
            hint={formatCurrency(amount)}
            tone="money"
            onPress={() => setArmed(true)}
          />
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  countHint: { textAlign: 'center', marginTop: 4 },
  card: { marginBottom: 16, gap: 6 },
  label: { ...type.label, color: colors.muted, textTransform: 'uppercase', letterSpacing: 0.6 },
  amount: { fontSize: 34, fontWeight: '800', color: colors.ink, letterSpacing: -1 },
  action: { marginBottom: 12 },
});
