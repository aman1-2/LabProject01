import React, { useState } from 'react';
import { Linking, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { createSubscription, fetchAddresses, subscriptionKeys, patientKeys } from '@pathcare/api';
import { colors, type, card, layout } from '../theme.js';
import { Banner, Card, ErrorState, LoadingState, ScreenHeader } from '../components/ui.jsx';
import { Pressable3D, elevation, notifySuccess } from '../components/motion.jsx';
import Icon from '../components/Icon.jsx';
import { formatCurrency } from '../lib/format.js';

/**
 * Setting up a recurring plan.
 *
 * This screen authorises money to leave someone's account repeatedly, so the
 * exact terms — amount, cadence, and that they can stop it — are stated before
 * the button, not after it. The final action says what will happen ("Approve
 * in your bank app"), not a generic "Continue", because the next thing the
 * patient sees is their bank's own mandate screen.
 */

const CADENCES = [
  { days: 30, label: 'Monthly' },
  { days: 90, label: 'Quarterly' },
  { days: 180, label: 'Every 6 months' },
];

export default function SubscribeScreen({ navigation, route }) {
  const { slug, packageId, packageName, labCenterId, amount } = route.params ?? {};
  const queryClient = useQueryClient();

  const [frequencyDays, setFrequencyDays] = useState(90);
  const [addressId, setAddressId] = useState(null);
  const [error, setError] = useState(null);

  const addressesQuery = useQuery({
    queryKey: patientKeys.addresses(),
    queryFn: () => fetchAddresses(),
  });
  const addresses = addressesQuery.data?.items ?? addressesQuery.data ?? [];
  const effectiveAddressId = addressId ?? addresses[0]?._id ?? null;

  const mutation = useMutation({
    mutationFn: () =>
      createSubscription({
        packageId: packageId ?? slug,
        labCenterId,
        frequencyDays,
        mode: 'home',
        addressId: effectiveAddressId,
        // No amount is sent — the mandate's value is computed server-side.
      }),
    onSuccess: async (result) => {
      notifySuccess();
      await queryClient.invalidateQueries({ queryKey: subscriptionKeys.all() });

      // Straight to the bank's mandate screen; nothing is charged until the
      // patient approves it there.
      if (result?.authorizationUrl) {
        Linking.openURL(result.authorizationUrl).catch(() => {});
      }
      navigation.replace('Subscriptions');
    },
    onError: (err) => setError(err?.message || 'Could not set up that plan.'),
  });

  const perYear = Math.round((365 / frequencyDays) * (amount ?? 0));

  return (
    <View style={layout.screen} testID="screen-subscribe">
      <ScreenHeader title="Set up a plan" onBack={navigation.goBack} />
      {error ? <Banner tone="red" text={error} testID="subscribe-error" /> : null}

      <ScrollView contentContainerStyle={styles.body}>
        <Card style={[card.padded, styles.hero, elevation.card]}>
          <View style={styles.heroIcon}>
            <Icon name="repeat" size={20} color={colors.blue700} />
          </View>
          <Text style={styles.heroTitle}>{packageName ?? 'Care plan'}</Text>
          <Text style={styles.heroAmount}>{formatCurrency(amount)}</Text>
          <Text style={styles.heroMeta}>per collection, at your chosen lab</Text>
        </Card>

        <Text style={styles.sectionLabel}>How often?</Text>
        <View style={styles.cadenceRow}>
          {CADENCES.map((cadence) => {
            const selected = frequencyDays === cadence.days;
            return (
              <Pressable3D
                key={cadence.days}
                testID={`cadence-${cadence.days}`}
                onPress={() => setFrequencyDays(cadence.days)}
                style={[card.base, styles.cadenceCard, selected && card.selected]}
                accessibilityLabel={cadence.label}
              >
                <Text style={[styles.cadenceLabel, selected && styles.cadenceLabelSelected]}>
                  {cadence.label}
                </Text>
                <Text style={styles.cadenceEvery}>every {cadence.days} days</Text>
              </Pressable3D>
            );
          })}
        </View>

        <Text style={styles.sectionLabel}>Collection address</Text>
        {addressesQuery.isLoading ? (
          <LoadingState label="Loading addresses…" />
        ) : addressesQuery.isError ? (
          <ErrorState message={addressesQuery.error?.message} onRetry={addressesQuery.refetch} />
        ) : addresses.length === 0 ? (
          <Card style={[card.padded, styles.noAddress]}>
            <Text style={type.bodyMuted}>
              A recurring home collection needs an address. Add one and come back.
            </Text>
            <Pressable3D
              testID="btn-add-address"
              onPress={() => navigation.navigate('Addresses')}
              style={styles.addAddress}
            >
              <Icon name="plus" size={15} color={colors.white} />
              <Text style={styles.addAddressLabel}>Add an address</Text>
            </Pressable3D>
          </Card>
        ) : (
          addresses.map((address) => {
            const selected = effectiveAddressId === address._id;
            return (
              <Pressable3D
                key={address._id}
                testID={`sub-address-${address._id}`}
                onPress={() => setAddressId(address._id)}
                style={[card.base, styles.addressCard, selected && card.selected]}
              >
                <Icon name="mapPin" size={16} color={selected ? colors.blue700 : colors.muted2} />
                <View style={styles.addressText}>
                  <Text style={styles.addressLabel}>{address.label}</Text>
                  <Text style={styles.addressLine} numberOfLines={1}>
                    {address.line} · {address.pincode}
                  </Text>
                </View>
              </Pressable3D>
            );
          })
        )}

        {/* The terms, before the button rather than after it. */}
        <Card style={[card.padded, styles.terms]} testID="mandate-terms">
          <Text style={styles.termsHeading}>What you are approving</Text>
          <TermRow
            icon="wallet"
            text={`${formatCurrency(amount)} every ${frequencyDays} days — about ${formatCurrency(perYear)} a year.`}
          />
          <TermRow
            icon="alert"
            text="We'll notify you at least 24 hours before every payment, so you can pause or cancel first."
          />
          <TermRow icon="pause" text="Pause or cancel any time, from this app or your bank app." />
          <TermRow
            icon="shield"
            text="Your bank holds the mandate. PathCare never sees your UPI PIN or card details."
          />
        </Card>

        <Pressable3D
          testID="btn-create-subscription"
          onPress={() => mutation.mutate()}
          disabled={mutation.isPending || !effectiveAddressId}
          haptic="medium"
          style={[
            styles.cta,
            (mutation.isPending || !effectiveAddressId) && styles.ctaDisabled,
            elevation.card,
          ]}
        >
          <Text style={styles.ctaLabel}>
            {mutation.isPending ? 'Setting up…' : 'Approve in your bank app'}
          </Text>
        </Pressable3D>

        <Text style={styles.footnote}>
          Nothing is charged now. Your first payment is taken on your first collection date.
        </Text>
      </ScrollView>
    </View>
  );
}

function TermRow({ icon, text }) {
  return (
    <View style={styles.termRow}>
      <Icon name={icon} size={15} color={colors.blue600} strokeWidth={2.2} />
      <Text style={styles.termText}>{text}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  body: { paddingHorizontal: 20, paddingBottom: 60 },
  hero: { alignItems: 'center', gap: 4, marginBottom: 24, paddingVertical: 24 },
  heroIcon: {
    width: 44,
    height: 44,
    borderRadius: 14,
    backgroundColor: colors.blue50,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 6,
  },
  heroTitle: { fontSize: 15, fontWeight: '800', color: colors.ink, textAlign: 'center' },
  heroAmount: { fontSize: 30, fontWeight: '800', color: colors.ink, letterSpacing: -0.8, marginTop: 4 },
  heroMeta: { ...type.meta },
  sectionLabel: { fontWeight: '800', fontSize: 14.5, color: colors.ink, marginBottom: 12, marginTop: 6 },
  cadenceRow: { flexDirection: 'row', gap: 8, marginBottom: 22 },
  cadenceCard: { flex: 1, paddingVertical: 14, paddingHorizontal: 8, alignItems: 'center', gap: 2, minHeight: 44 },
  cadenceLabel: { fontSize: 12.5, fontWeight: '800', color: colors.ink, textAlign: 'center' },
  cadenceLabelSelected: { color: colors.blue700 },
  cadenceEvery: { fontSize: 10.5, color: colors.muted2 },
  addressCard: { flexDirection: 'row', alignItems: 'center', gap: 10, padding: 14, marginBottom: 10 },
  addressText: { flex: 1 },
  addressLabel: { fontWeight: '700', fontSize: 13, color: colors.ink },
  addressLine: { ...type.meta, marginTop: 2 },
  noAddress: { gap: 14, marginBottom: 10 },
  addAddress: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    backgroundColor: colors.blue600,
    borderRadius: 999,
    paddingVertical: 12,
    minHeight: 44,
  },
  addAddressLabel: { color: colors.white, fontWeight: '700', fontSize: 13.5 },
  terms: { backgroundColor: colors.blue50, borderColor: colors.blue100, gap: 12, marginTop: 22, marginBottom: 22 },
  termsHeading: { fontWeight: '800', fontSize: 13.5, color: colors.ink },
  termRow: { flexDirection: 'row', gap: 10, alignItems: 'flex-start' },
  termText: { flex: 1, fontSize: 12.5, color: colors.ink, lineHeight: 19 },
  cta: {
    backgroundColor: colors.blue600,
    borderRadius: 999,
    paddingVertical: 16,
    alignItems: 'center',
    minHeight: 44,
  },
  ctaDisabled: { backgroundColor: colors.disabledBg },
  ctaLabel: { color: colors.white, fontWeight: '700', fontSize: 15 },
  footnote: { ...type.meta, textAlign: 'center', marginTop: 14, lineHeight: 18 },
});
