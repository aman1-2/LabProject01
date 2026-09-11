import React from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { useQuery } from '@tanstack/react-query';
import { fetchPatientBooking, patientKeys } from '@pathcare/api';
import { colors, type, layout } from '../theme.js';
import { Banner, Card, GhostButton, LoadingState, PrimaryButton } from '../components/ui.jsx';
import Icon from '../components/Icon.jsx';
import { formatCurrency, formatSlot, testNamesOf } from '../lib/format.js';

/**
 * Confirmation, following the prototype's booking-confirm sheet: a green tick
 * disc, a heading, the essentials, then a single onward action.
 *
 * `pendingConfirmation` means checkout closed before the webhook landed. That
 * is NOT a failure — the webhook is the source of truth and may simply still be
 * in flight (CONTEXT §3.3) — so the copy says exactly that rather than claiming
 * either success or failure it cannot know.
 */
export default function BookingConfirmedScreen({ navigation, route }) {
  const { bookingId, pendingConfirmation } = route.params ?? {};

  const query = useQuery({
    queryKey: patientKeys.booking(bookingId),
    queryFn: () => fetchPatientBooking(bookingId),
    enabled: Boolean(bookingId),
    refetchInterval: pendingConfirmation ? 5000 : false,
  });

  const booking = query.data?.booking ?? query.data;
  const paid = booking?.paymentStatus === 'paid';

  return (
    <View style={layout.screen} testID="screen-booking-confirmed">
      <ScrollView contentContainerStyle={styles.body}>
        <View style={styles.tick}>
          <Icon name="check" size={30} color={colors.green} strokeWidth={2.5} />
        </View>

        <Text style={styles.title}>Booking confirmed</Text>
        <Text style={styles.subtitle}>
          {booking?.mode === 'home'
            ? 'A certified phlebotomist will collect your sample at your address.'
            : 'Visit your chosen lab centre at the selected time.'}
        </Text>

        {pendingConfirmation && !paid ? (
          <Banner
            testID="banner-payment-pending"
            tone="amber"
            text="Your payment is still being confirmed by the bank. This usually takes a few seconds and updates on its own."
          />
        ) : null}

        {query.isLoading ? (
          <LoadingState label="Loading your booking…" />
        ) : booking ? (
          <Card style={styles.card} testID="confirmed-summary">
            <Text style={styles.cardTitle}>{testNamesOf(booking)}</Text>
            <Text style={styles.cardMeta}>{formatSlot(booking.slotDateTime)}</Text>
            <Text style={styles.cardMeta}>
              {formatCurrency(booking.amount)} ·{' '}
              {paid ? 'Paid' : booking.paymentMode === 'cash' ? 'Pay cash at collection' : 'Payment pending'}
            </Text>
            <Text style={styles.reference}>#{String(booking._id).slice(-6).toUpperCase()}</Text>
          </Card>
        ) : null}

        <PrimaryButton
          testID="btn-track-booking"
          label="Track this booking"
          onPress={() => navigation.navigate('TrackTab', { bookingId })}
          style={styles.action}
        />
        <GhostButton testID="btn-back-home" label="Back to home" onPress={() => navigation.navigate('HomeTab')} />
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  body: { paddingHorizontal: 24, paddingTop: 48, paddingBottom: 60, alignItems: 'stretch' },
  // Prototype confirm sheet: 64px green-bg disc.
  tick: {
    width: 64,
    height: 64,
    borderRadius: 999,
    backgroundColor: colors.greenBg,
    alignItems: 'center',
    justifyContent: 'center',
    alignSelf: 'center',
    marginBottom: 16,
  },
  title: { fontSize: 19, fontWeight: '800', letterSpacing: -0.4, color: colors.ink, textAlign: 'center', marginBottom: 8 },
  subtitle: { ...type.bodyMuted, fontSize: 13.5, textAlign: 'center', marginBottom: 22 },
  card: { padding: 18, marginBottom: 22, gap: 4 },
  cardTitle: { fontWeight: '800', fontSize: 14.5, color: colors.ink },
  cardMeta: { ...type.meta, lineHeight: 18 },
  reference: { ...type.meta, marginTop: 8, fontWeight: '700' },
  action: { marginBottom: 12 },
});
