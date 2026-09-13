import React, { useMemo } from 'react';
import { Linking, Platform, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useRiderJobs } from '../api/riderHooks.js';
import { useOutbox } from '../offline/OutboxContext.jsx';
import { colors, type, layout, card } from '../theme.js';
import {
  Banner,
  Card,
  Chip,
  ErrorState,
  GhostButton,
  KeyValue,
  LoadingState,
  ScreenHeader,
} from '../components/ui.jsx';
import { BigAction, StepTrail } from '../components/bigAction.jsx';
import { formatCurrency, formatSlot, testNamesOf, STATUS_LABELS, STATUS_TONES } from '../lib/format.js';

/**
 * The job the rider is holding: who, where, what to collect, and the single
 * next action.
 *
 * There is exactly one primary action visible at a time, derived from the
 * booking's server-side status. Offering "hand off at lab" before the sample is
 * collected would just produce an INVALID_STATUS_TRANSITION the rider cannot
 * act on.
 */
export default function JobDetailScreen({ navigation, route }) {
  const { bookingId } = route.params ?? {};
  const { data, isLoading, isError, error, refetch } = useRiderJobs();
  const { pending, isOnline } = useOutbox();

  const job = data?.activeJob?._id === bookingId ? data.activeJob : null;

  const openDirections = useMemo(() => {
    const address = job?.collectionAddress;
    if (!address?.lat || !address?.lng) return null;

    // Hand off to the device's map app rather than routing in-app: the rider
    // already has their preferred navigation running on a windshield mount.
    const label = encodeURIComponent(address.label || 'Collection address');
    const url = Platform.select({
      ios: `maps://?daddr=${address.lat},${address.lng}&q=${label}`,
      android: `geo:${address.lat},${address.lng}?q=${address.lat},${address.lng}(${label})`,
      default: `https://www.google.com/maps/dir/?api=1&destination=${address.lat},${address.lng}`,
    });

    return () => Linking.openURL(url).catch(() => {});
  }, [job]);

  if (isLoading) {
    return (
      <View style={layout.screen} testID="screen-job-detail">
        <ScreenHeader title="Job" onBack={navigation.goBack} />
        <LoadingState label="Loading job…" />
      </View>
    );
  }

  if (isError) {
    return (
      <View style={layout.screen} testID="screen-job-detail">
        <ScreenHeader title="Job" onBack={navigation.goBack} />
        <ErrorState
          message={error?.isNetworkError ? 'No connection. Reconnect to load this job.' : error?.message}
          onRetry={refetch}
        />
      </View>
    );
  }

  if (!job) {
    // The active job changed under us — released, reassigned, or completed.
    return (
      <View style={layout.screen} testID="screen-job-detail">
        <ScreenHeader title="Job" onBack={navigation.goBack} />
        <ErrorState
          testID="state-job-gone"
          message="This job is no longer assigned to you. Pull down on Jobs to see what is available."
          onRetry={() => navigation.navigate('JobsTab')}
        />
      </View>
    );
  }

  const isCash = job.paymentMode === 'cash';
  const cashOutstanding = isCash && job.paymentStatus !== 'paid';
  const collected = ['collected', 'at_lab', 'processing', 'report_ready', 'completed'].includes(job.status);
  const handedOff = ['at_lab', 'processing', 'report_ready', 'completed'].includes(job.status);

  /**
   * Present only when the booking was placed for someone other than the
   * account holder. `familyMemberId` is populated by the API on the claimed
   * job only — an unclaimed job deliberately carries no identity at all.
   */
  const familyMember = job?.familyMemberId && typeof job.familyMemberId === 'object'
    ? job.familyMemberId
    : null;
  const familyMemberMeta = familyMember
    ? [familyMember.relation, familyMember.gender, familyMember.age ? `${familyMember.age} yrs` : null]
        .filter(Boolean)
        .join(' · ')
    : '';

  /**
   * The journey, and where along it this job sits.
   *
   * Built from the same flags the actions below use, so the dots and the
   * button can never tell the rider two different things. The cash step only
   * exists when there is cash to take, so the trail never shows a step that
   * does not apply to this booking.
   */
  const steps = [
    { key: 'collect', label: 'Collect' },
    ...(isCash ? [{ key: 'cash', label: 'Take cash' }] : []),
    { key: 'handoff', label: 'Hand in' },
  ];
  const currentStep = !collected
    ? 0
    : cashOutstanding
      ? steps.findIndex((step) => step.key === 'cash')
      : handedOff
        ? steps.length
        : steps.findIndex((step) => step.key === 'handoff');

  return (
    <View style={layout.screen} testID="screen-job-detail">
      <ScreenHeader title="Collection" onBack={navigation.goBack} />

      {!isOnline ? <Banner tone="amber" text="Offline — your updates are saved and will send on reconnect." /> : null}
      {pending > 0 ? <Banner tone="blue" text={`${pending} update${pending === 1 ? '' : 's'} waiting to sync.`} /> : null}

      <ScrollView contentContainerStyle={layout.scrollBody}>
        <View style={styles.titleRow}>
          <Text style={type.sectionTitle}>{testNamesOf(job)}</Text>
          <Chip
            testID="chip-job-status"
            label={STATUS_LABELS[job.status] ?? job.status}
            tone={STATUS_TONES[job.status] ?? 'grey'}
          />
        </View>
        <Text style={styles.reference}>#{String(job._id).slice(-6).toUpperCase()}</Text>

        {/* Where the rider is in this collection, as numbered dots. "Step 2
            of 3" is understood by almost anyone; a paragraph describing what
            happens next is not. The cash step only appears when there is cash
            to take, so the trail never shows a step that does not apply. */}
        <StepTrail testID="job-steps" steps={steps} current={currentStep} />

        <Card style={[card.padded, styles.card]} testID="card-patient">
          <Text style={styles.cardHeading}>Patient</Text>

          {/* A booking can be placed by one person FOR another — a spouse, a
              child, an elderly parent. The account holder is then the contact,
              not the person to draw from. Showing only the account holder's
              name invites the rider to draw from the wrong person and label it
              against this booking, which puts one person's results on another
              person's record. So when the two differ, say so plainly and put
              the person being drawn from first. */}
          {familyMember ? (
            <View testID="banner-draw-from" style={styles.drawFrom}>
              <Text style={styles.drawFromLabel}>SAMPLE FROM</Text>
              <Text style={styles.drawFromName}>{familyMember.name}</Text>
              <Text style={styles.drawFromMeta}>{familyMemberMeta}</Text>
            </View>
          ) : null}

          <KeyValue
            label={familyMember ? 'Booked by (contact)' : 'Name'}
            value={job.patientId?.name || 'Not provided'}
            testID="kv-patient-name"
          />
          <KeyValue label="Phone" value={job.patientId?.phone || 'Not provided'} testID="kv-patient-phone" />
          {job.patientId?.phone ? (
            <GhostButton
              testID="btn-call-patient"
              label="Call patient"
              onPress={() => Linking.openURL(`tel:${job.patientId.phone}`).catch(() => {})}
            />
          ) : null}
        </Card>

        <Card style={[card.padded, styles.card]} testID="card-address">
          <Text style={styles.cardHeading}>Collection address</Text>
          {job.collectionAddress ? (
            <>
              <KeyValue label={job.collectionAddress.label || 'Address'} value={job.collectionAddress.line} />
              <KeyValue label="Pincode" value={job.collectionAddress.pincode} />
              {openDirections ? (
                <BigAction
                  testID="btn-navigate"
                  icon="compass"
                  label="Navigate"
                  hint="Open directions"
                  tone="neutral"
                  onPress={openDirections}
                />
              ) : (
                <Text style={type.bodyMuted}>
                  This address has no coordinates, so turn-by-turn navigation is unavailable. Call the patient for
                  directions.
                </Text>
              )}
            </>
          ) : (
            <Text style={type.bodyMuted}>No collection address on this booking.</Text>
          )}
        </Card>

        <Card style={[card.padded, styles.card]} testID="card-payment">
          <Text style={styles.cardHeading}>Payment</Text>
          <View style={layout.rowBetween}>
            <Text style={styles.amount}>{formatCurrency(job.amount)}</Text>
            <Chip
              testID="chip-payment"
              label={job.paymentStatus === 'paid' ? 'Paid' : isCash ? 'Cash on collection' : 'Awaiting payment'}
              tone={job.paymentStatus === 'paid' ? 'green' : isCash ? 'amber' : 'grey'}
            />
          </View>
          <Text style={styles.slot}>{formatSlot(job.slotDateTime)}</Text>
        </Card>

        {/* One next action, derived from the server's status. */}
        {!collected ? (
          <BigAction
            testID="btn-start-collection"
            icon="droplet"
            label="Collect sample"
            hint="Label the vial"
            tone="go"
            onPress={() => navigation.navigate('Collection', { bookingId: job._id })}
          />
        ) : null}

        {collected && cashOutstanding ? (
          <BigAction
            testID="btn-collect-cash"
            icon="wallet"
            label="Take cash"
            hint={formatCurrency(job.amount)}
            tone="money"
            onPress={() => navigation.navigate('Cash', { bookingId: job._id, amount: job.amount })}
          />
        ) : null}

        {collected && !cashOutstanding && !handedOff ? (
          <BigAction
            testID="btn-handoff"
            icon="hospital"
            label="Hand in at lab"
            hint="Scan the tube"
            tone="go"
            onPress={() => navigation.navigate('Handoff', { bookingId: job._id, barcode: job.barcode ?? null })}
          />
        ) : null}

        {handedOff ? (
          <Banner testID="banner-done" tone="blue" text="Sample handed off at the lab. Nothing further to do." />
        ) : null}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  drawFrom: {
    backgroundColor: colors.amberBg,
    borderWidth: 1.5,
    borderColor: colors.amber,
    borderRadius: 12,
    paddingVertical: 12,
    paddingHorizontal: 14,
    marginBottom: 14,
  },
  drawFromLabel: { fontSize: 11, fontWeight: '800', letterSpacing: 0.8, color: colors.amberDark },
  drawFromName: { fontSize: 19, fontWeight: '800', color: colors.ink, marginTop: 3 },
  drawFromMeta: { fontSize: 13, color: colors.muted, marginTop: 2 },
  titleRow: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12 },
  reference: { ...type.meta, marginTop: 2, marginBottom: 18 },
  card: { marginBottom: 14, gap: 4 },
  cardHeading: { ...type.label, color: colors.muted, textTransform: 'uppercase', letterSpacing: 0.6, marginBottom: 10 },
  amount: { fontSize: 20, fontWeight: '800', color: colors.ink },
  slot: { ...type.meta, marginTop: 8 },
  action: { marginTop: 6 },
});
