import React, { useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import {
  fetchAddresses,
  fetchFamilyMembers,
  createPatientBooking,
  patientKeys,
} from '@pathcare/api';
import { resolveCheckoutPrice, StalePriceError } from '../catalogue/checkout.js';
import { colors, type, card, calendar, slot as slotStyles, layout } from '../theme.js';
import {
  Banner,
  Card,
  EmptyState,
  ErrorState,
  LoadingState,
  PrimaryButton,
  ScreenHeader,
} from '../components/ui.jsx';
import { formatCurrency } from '../lib/format.js';
import { DEHRADUN } from '../config/city.js';

/**
 * Booking, following DESIGN_SPEC §3.6's five numbered sections adapted to one
 * mobile column: who for → lab (already chosen) → slot → referring doctor →
 * payment, then a blue50 summary and a confirm button that stays disabled until
 * a slot and payment mode are chosen.
 *
 * The price shown in the summary is RE-FETCHED here, not carried from the
 * previous screen: §7.3 forbids charging from a cached or bundled price, and
 * the catalogue may have changed while the patient was choosing.
 */

/** Prototype slot grid. Real availability is enforced server-side on the slot. */
const SLOT_TIMES = ['07:00', '08:00', '09:00', '10:00', '11:00', '15:00', '16:00', '17:00'];

function nextDays(count = 7) {
  const today = new Date();
  return Array.from({ length: count }, (_, offset) => {
    const date = new Date(today);
    date.setDate(today.getDate() + offset);
    date.setHours(0, 0, 0, 0);
    return date;
  });
}

export default function BookingScreen({ navigation, route }) {
  const { slug, slugs, labCenterId, mode } = route.params ?? {};

  /**
   * What is being booked.
   *
   * A single `slug` when arriving from a test page ("book this one now"), or
   * `slugs` when arriving from the basket. The singular case is deliberately
   * still supported: booking one test should not have to go through a basket.
   */
  const bookingSlugs = useMemo(
    () => (Array.isArray(slugs) && slugs.length > 0 ? slugs : [slug].filter(Boolean)),
    [slugs, slug]
  );
  const queryClient = useQueryClient();

  const days = useMemo(() => nextDays(7), []);
  const [dayIndex, setDayIndex] = useState(0);
  const [time, setTime] = useState(null);
  const [paymentMode, setPaymentMode] = useState(null);
  const [familyMemberId, setFamilyMemberId] = useState(null);
  const [addressId, setAddressId] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);

  /**
   * The live price. `enabled` on the test slug so it refetches if the patient
   * comes back to this screen later; `staleTime: 0` so it is never served from
   * cache — this number is the one they are about to pay.
   */
  const priceQuery = useQuery({
    queryKey: ['checkout-price', bookingSlugs.join(','), labCenterId],
    queryFn: () =>
      resolveCheckoutPrice({
        tests: bookingSlugs.map((s) => ({ slug: s })),
        labCenterId,
        lat: DEHRADUN.lat,
        lng: DEHRADUN.lng,
      }),
    enabled: bookingSlugs.length > 0 && Boolean(labCenterId),
    staleTime: 0,
    gcTime: 0,
    retry: false,
  });

  const addressesQuery = useQuery({
    queryKey: patientKeys.addresses(),
    queryFn: () => fetchAddresses(),
    enabled: mode === 'home',
  });

  const familyQuery = useQuery({
    queryKey: patientKeys.familyMembers(),
    queryFn: () => fetchFamilyMembers(),
  });

  const addresses = addressesQuery.data?.items ?? addressesQuery.data ?? [];
  const familyMembers = familyQuery.data?.items ?? familyQuery.data ?? [];

  const effectiveAddressId = addressId ?? addresses[0]?._id ?? null;
  const canConfirm =
    Boolean(time) && Boolean(paymentMode) && Boolean(priceQuery.data) && (mode !== 'home' || effectiveAddressId);

  async function confirm() {
    setBusy(true);
    setError(null);

    try {
      const slotDate = new Date(days[dayIndex]);
      const [hours, minutes] = time.split(':').map(Number);
      slotDate.setHours(hours, minutes, 0, 0);

      // Re-confirm the price immediately before creating the booking. Anything
      // stale throws rather than being charged (§7.3).
      const live = await resolveCheckoutPrice({
        tests: bookingSlugs.map((s) => ({ slug: s })),
        labCenterId,
        lat: DEHRADUN.lat,
        lng: DEHRADUN.lng,
      });

      // Every item the quote priced, split by kind. A basket can now hold more
      // than one checkup, so packages go into a list rather than a single field.
      const priced = live.tests?.length ? live.tests : [live.test].filter(Boolean);
      const isPackageItem = (item) => item?.category === 'package' || item?.category === 'plan';
      const idOf = (item) => item?._id ?? item?.id;

      const booking = await createPatientBooking(
        {
          testIds: priced.filter((item) => !isPackageItem(item)).map(idOf),
          packageIds: priced.filter(isPackageItem).map(idOf),
          labCenterId,
          mode,
          ...(mode === 'home' ? { addressId: effectiveAddressId } : {}),
          ...(familyMemberId ? { familyMemberId } : {}),
          slotDateTime: slotDate.toISOString(),
          paymentMode,
        },
        // One key per attempt, reused across retries: a double tap must not
        // create two bookings (CONTEXT §3.3).
        `${bookingSlugs.join('+')}-${slotDate.getTime()}-${paymentMode}`
      );

      await queryClient.invalidateQueries({ queryKey: patientKeys.bookings({ scope: 'home' }) });

      const created = booking?.booking ?? booking;

      if (paymentMode === 'upi') {
        navigation.replace('Payment', { bookingId: created._id, amount: created.amount });
      } else {
        navigation.replace('BookingConfirmed', { bookingId: created._id });
      }
    } catch (err) {
      if (err instanceof StalePriceError) {
        setError(err.message);
      } else if (err?.code === 'HOME_COLLECTION_UNAVAILABLE') {
        setError(err.message);
      } else if (err?.isNetworkError) {
        setError('No connection. A booking needs signal so we can confirm the price and reserve your slot.');
      } else {
        setError(err?.message || 'Could not create the booking.');
      }
    } finally {
      setBusy(false);
    }
  }

  return (
    <View style={layout.screen} testID="screen-booking">
      <ScreenHeader title="Book a slot" onBack={navigation.goBack} />
      {error ? <Banner tone="red" text={error} testID="booking-error" /> : null}

      <ScrollView contentContainerStyle={styles.body}>
        {/* 1 — who for */}
        <Text style={styles.step}>1 · Who is this for?</Text>
        <View style={styles.pillRow}>
          <Pill testID="who-me" label="Myself" selected={!familyMemberId} onPress={() => setFamilyMemberId(null)} />
          {familyMembers.map((member) => (
            <Pill
              key={member._id}
              testID={`who-${member._id}`}
              label={member.name}
              selected={familyMemberId === member._id}
              onPress={() => setFamilyMemberId(member._id)}
            />
          ))}
        </View>
        {familyMembers.length === 0 ? (
          <Text style={styles.hint}>Family members you add in Profile will appear here.</Text>
        ) : null}

        {/* 2 — address, home mode only */}
        {mode === 'home' ? (
          <>
            <Text style={styles.step}>2 · Collection address</Text>
            {addressesQuery.isLoading ? (
              <LoadingState label="Loading addresses…" />
            ) : addresses.length === 0 ? (
              <EmptyState
                testID="empty-addresses"
                icon="mapPin"
                title="No saved address"
                message="A home collection needs an address so the phlebotomist knows where to come."
                ctaLabel="Add an address"
                onCta={() => navigation.navigate('ProfileTab', { screen: 'Addresses' })}
              />
            ) : (
              addresses.map((address) => (
                <Pressable
                  key={address._id}
                  testID={`address-${address._id}`}
                  accessibilityRole="radio"
                  accessibilityState={{ selected: effectiveAddressId === address._id }}
                  onPress={() => setAddressId(address._id)}
                  style={[card.base, styles.addressCard, effectiveAddressId === address._id && card.selected]}
                >
                  <Text style={styles.addressLabel}>{address.label}</Text>
                  <Text style={styles.addressLine}>
                    {address.line} · {address.pincode}
                  </Text>
                </Pressable>
              ))
            )}
          </>
        ) : null}

        {/* 3 — slot */}
        <Text style={styles.step}>{mode === 'home' ? '3' : '2'} · Pick a slot</Text>
        <View style={calendar.grid}>
          {days.map((date, index) => {
            const selected = index === dayIndex;
            return (
              <Pressable
                key={date.toISOString()}
                testID={`day-${index}`}
                accessibilityRole="button"
                accessibilityState={{ selected }}
                onPress={() => setDayIndex(index)}
                style={[calendar.day, selected && calendar.daySelected]}
              >
                <Text style={[calendar.dayLabel, styles.dayName, selected && calendar.daySelectedLabel]}>
                  {date.toLocaleDateString('en-IN', { weekday: 'narrow' })}
                </Text>
                <Text style={[calendar.dayLabel, selected && calendar.daySelectedLabel]}>{date.getDate()}</Text>
              </Pressable>
            );
          })}
        </View>

        <View style={styles.slotGrid}>
          {SLOT_TIMES.map((value) => {
            const selected = time === value;
            return (
              <Pressable
                key={value}
                testID={`slot-${value}`}
                accessibilityRole="button"
                accessibilityState={{ selected }}
                onPress={() => setTime(value)}
                style={[slotStyles.base, styles.slotItem, selected && slotStyles.selected]}
              >
                <Text style={[slotStyles.label, selected && slotStyles.selectedLabel]}>{value}</Text>
              </Pressable>
            );
          })}
        </View>

        {/* 4 — payment */}
        <Text style={styles.step}>{mode === 'home' ? '4' : '3'} · Payment</Text>
        <View style={styles.pillRow}>
          <Pill testID="pay-upi" label="Pay online (UPI)" selected={paymentMode === 'upi'} onPress={() => setPaymentMode('upi')} />
          {mode === 'home' ? (
            <Pill
              testID="pay-cash"
              label="Cash on collection"
              selected={paymentMode === 'cash'}
              onPress={() => setPaymentMode('cash')}
            />
          ) : null}
        </View>

        {/* Summary — blue50 block per §3.6 */}
        <Card style={styles.summary} testID="booking-summary">
          {priceQuery.isLoading ? (
            <LoadingState label="Confirming today's price…" />
          ) : priceQuery.isError ? (
            <ErrorState
              testID="price-error"
              message={
                priceQuery.error?.isNetworkError
                  ? 'We could not confirm the price. Booking needs a connection so you are never charged a stale amount.'
                  : priceQuery.error?.message
              }
              onRetry={priceQuery.refetch}
            />
          ) : (
            <>
              <View style={styles.summaryRow}>
                <Text style={styles.summaryLabel}>{priceQuery.data.test?.name}</Text>
                <Text style={styles.summaryValue}>{formatCurrency(priceQuery.data.price)}</Text>
              </View>
              <Text style={styles.summaryMeta}>
                {priceQuery.data.labName} · reports in {priceQuery.data.turnaroundHrs} hrs
              </Text>
              <Text style={styles.summaryMeta}>
                {mode === 'home' ? 'Home collection · ₹0 collection fee' : 'Lab visit'}
              </Text>
            </>
          )}
        </Card>

        <PrimaryButton
          testID="btn-confirm-booking"
          label={paymentMode === 'cash' ? 'Confirm booking' : 'Confirm & pay'}
          onPress={confirm}
          loading={busy}
          disabled={!canConfirm}
        />
        {!canConfirm ? (
          <Text style={styles.hint} testID="confirm-hint">
            Choose a slot and a payment method to continue.
          </Text>
        ) : null}
      </ScrollView>
    </View>
  );
}

function Pill({ label, selected, onPress, testID }) {
  return (
    <Pressable
      testID={testID}
      accessibilityRole="radio"
      accessibilityState={{ selected }}
      onPress={onPress}
      style={[card.base, styles.pill, selected && card.selected]}
    >
      <Text style={[styles.pillLabel, selected && styles.pillLabelSelected]}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  body: { paddingHorizontal: 20, paddingBottom: 60 },
  step: { fontWeight: '800', fontSize: 14.5, color: colors.ink, marginTop: 20, marginBottom: 12 },
  pillRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  pill: { paddingVertical: 11, paddingHorizontal: 16, minHeight: 44, justifyContent: 'center' },
  pillLabel: { fontSize: 13, fontWeight: '700', color: colors.ink },
  pillLabelSelected: { color: colors.blue700 },
  hint: { ...type.meta, marginTop: 10, lineHeight: 17 },
  addressCard: { padding: 14, marginBottom: 10 },
  addressLabel: { fontWeight: '700', fontSize: 13, color: colors.ink },
  addressLine: { color: colors.muted, fontSize: 11.5, marginTop: 2 },
  dayName: { fontSize: 10.5, color: colors.muted2, marginBottom: 2 },
  slotGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 16 },
  slotItem: { flexBasis: '31%', flexGrow: 0 },
  // §3.6 blue50 summary block.
  summary: { backgroundColor: colors.blue50, borderColor: colors.blue100, padding: 16, marginTop: 24, marginBottom: 20 },
  summaryRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 12 },
  summaryLabel: { fontWeight: '700', fontSize: 13.5, color: colors.ink, flex: 1 },
  summaryValue: { fontWeight: '800', fontSize: 19, color: colors.ink },
  summaryMeta: { ...type.meta, marginTop: 6 },
});
