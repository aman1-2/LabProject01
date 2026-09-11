import React, { useCallback, useState } from 'react';
import { Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useRiderJobs, useAcceptJob, useRiderStatus } from '../api/riderHooks.js';
import { useOutbox } from '../offline/OutboxContext.jsx';
import { colors, type, layout, card } from '../theme.js';
import {
  Banner,
  Card,
  Chip,
  EmptyState,
  ErrorState,
  GhostButton,
  TopBar,
} from '../components/ui.jsx';
import { SkeletonList, FadeInView, elevation, notifySuccess, notifyWarning } from '../components/motion.jsx';
import Icon from '../components/Icon.jsx';
import { BigAction } from '../components/bigAction.jsx';
import { formatCurrency, formatSlot, testNamesOf, STATUS_LABELS, STATUS_TONES } from '../lib/format.js';

/**
 * The rider's home: the job they hold, and the unclaimed jobs at their centre.
 *
 * Unclaimed jobs deliberately carry no patient name or phone — the server does
 * not send them until the job is claimed, because a pending booking's identity
 * would otherwise be visible to every rider at the centre who might never take it.
 */
export default function JobsScreen({ navigation }) {
  const { data, isLoading, isError, error, refetch, isRefetching } = useRiderJobs();
  const acceptMutation = useAcceptJob();
  const statusMutation = useRiderStatus();
  const { pending, isOnline } = useOutbox();
  const [notice, setNotice] = useState(null);

  const onAccept = useCallback(
    async (bookingId) => {
      setNotice(null);
      try {
        const result = await acceptMutation.mutateAsync(bookingId);
        // A claimed job is worth a distinct confirmation — the rider is often
        // looking at the road, not the screen.
        notifySuccess();
        navigation.navigate('JobDetail', { bookingId: result?.booking?._id ?? bookingId });
      } catch (err) {
        if (err?.code === 'JOB_ALREADY_TAKEN') {
          notifyWarning();
          setNotice('Another phlebotomist took that job. The list has been refreshed.');
        } else if (err?.code === 'RIDER_ALREADY_ASSIGNED') {
          setNotice('You already have an active job. Finish it before taking another.');
        } else if (err?.isNetworkError) {
          // Accepting is never queued: a claim you cannot confirm leaves a
          // patient waiting for a rider who does not know they are coming.
          setNotice('No connection. Accepting a job needs signal — try again once you are back online.');
        } else {
          setNotice(err?.message || 'Could not accept that job.');
        }
      }
    },
    [acceptMutation, navigation]
  );

  const activeJob = data?.activeJob ?? null;
  const availableJobs = data?.availableJobs ?? [];
  const riderStatus = data?.rider?.status;

  return (
    <View style={layout.screen} testID="screen-jobs">
      <TopBar>
        <Text style={type.screenTitle}>Jobs</Text>
        {riderStatus ? (
          <Pressable
            testID="btn-toggle-status"
            accessibilityRole="button"
            accessibilityLabel={riderStatus === 'available' ? 'Go offline' : 'Go available'}
            disabled={statusMutation.isPending || riderStatus === 'assigned'}
            onPress={() => statusMutation.mutate(riderStatus === 'available' ? 'offline' : 'available')}
          >
            <Chip
              testID="chip-rider-status"
              label={riderStatus === 'assigned' ? 'On a job' : riderStatus === 'available' ? 'Available' : 'Offline'}
              tone={riderStatus === 'assigned' ? 'blue' : riderStatus === 'available' ? 'green' : 'grey'}
            />
          </Pressable>
        ) : null}
      </TopBar>

      {!isOnline ? (
        <Banner testID="banner-offline" tone="amber" text="Offline — collection updates will send when you reconnect." />
      ) : null}
      {pending > 0 ? (
        <Banner
          testID="banner-pending"
          tone="blue"
          text={`${pending} update${pending === 1 ? '' : 's'} waiting to sync.`}
        />
      ) : null}
      {notice ? <Banner testID="banner-notice" tone="amber" text={notice} /> : null}

      {isLoading ? <SkeletonList count={3} /> : null}

      {isError && !isLoading ? (
        <ErrorState
          message={
            error?.isNetworkError
              ? 'No connection. Your job list will load when you are back online.'
              : error?.message
          }
          onRetry={refetch}
        />
      ) : null}

      {!isLoading && !isError ? (
        <ScrollView
          contentContainerStyle={layout.scrollBody}
          refreshControl={<RefreshControl refreshing={isRefetching} onRefresh={refetch} tintColor={colors.blue600} />}
        >
          {activeJob ? (
            <>
              <Text style={styles.sectionLabel}>Your active job</Text>
              <ActiveJobCard job={activeJob} onOpen={() => navigation.navigate('JobDetail', { bookingId: activeJob._id })} />
            </>
          ) : null}

          <Text style={styles.sectionLabel}>
            {activeJob ? 'Also available' : 'Available at your centre'}
          </Text>

          {availableJobs.length === 0 ? (
            <EmptyState
              title="No jobs waiting"
              message="New home collections at your centre will appear here as they are booked."
            />
          ) : (
            availableJobs.map((job, index) => (
              <FadeInView key={job._id} delay={Math.min(index * 50, 200)}>
              <AvailableJobCard
                job={job}
                disabled={Boolean(activeJob) || acceptMutation.isPending}
                accepting={acceptMutation.isPending && acceptMutation.variables === job._id}
                onAccept={() => onAccept(job._id)}
              />
              </FadeInView>
            ))
          )}
        </ScrollView>
      ) : null}
    </View>
  );
}

function ActiveJobCard({ job, onOpen }) {
  const address = job.collectionAddress;
  return (
    <Card style={[card.padded, card.selected, styles.card, elevation.float]} testID="card-active-job">
      <View style={layout.rowBetween}>
        <Text style={type.cardTitle}>{testNamesOf(job)}</Text>
        <Chip label={STATUS_LABELS[job.status] ?? job.status} tone={STATUS_TONES[job.status] ?? 'blue'} />
      </View>
      {job.patientId?.name ? <Text style={styles.meta}>{job.patientId.name}</Text> : null}
      {address ? (
        <View style={styles.metaRow}>
          <Icon name="mapPin" size={13} color={colors.muted2} strokeWidth={2.2} />
          <Text style={styles.meta} numberOfLines={2}>
            {address.label ? `${address.label} · ` : ''}
            {address.line}
          </Text>
        </View>
      ) : null}
      <View style={styles.metaRow}>
        <Icon name="clock" size={13} color={colors.muted2} strokeWidth={2.2} />
        <Text style={styles.meta}>{formatSlot(job.slotDateTime)}</Text>
      </View>
      <View style={styles.cardFooter}>
        <Text style={styles.amount}>{formatCurrency(job.amount)}</Text>
        {/* Once the cash is in the rider's hand this has to stop saying
            "Collect cash". The detail screen already reads `paymentStatus`;
            this card read `paymentMode`, which never changes — so a job whose
            cash had been taken still showed an amber prompt to take it, and
            the rider's two screens disagreed about whether ₹1,798 was owed. */}
        <Chip
          label={job.paymentStatus === 'paid' ? 'Paid' : job.paymentMode === 'cash' ? 'Collect cash' : 'Prepaid'}
          tone={job.paymentStatus === 'paid' || job.paymentMode !== 'cash' ? 'green' : 'amber'}
        />
      </View>
      {/* The rider holds exactly one job at a time, so this is the only
          thing to do on this card — sized accordingly. */}
      <BigAction
        testID="btn-open-active-job"
        icon="scooter"
        label="Open job"
        hint="See address and next step"
        tone="neutral"
        onPress={onOpen}
      />
    </Card>
  );
}

function AvailableJobCard({ job, onAccept, disabled, accepting }) {
  return (
    <Card style={[card.padded, styles.card, elevation.card]} testID={`card-job-${job._id}`}>
      <View style={layout.rowBetween}>
        <Text style={type.cardTitle}>{testNamesOf(job)}</Text>
        <Chip label={job.paymentMode === 'cash' ? 'Cash' : 'Prepaid'} tone={job.paymentMode === 'cash' ? 'amber' : 'green'} />
      </View>
      {/* Pincode and label only: the patient's identity is revealed on claim. */}
      <Text style={styles.meta}>
        {job.collectionAddress?.label ? `${job.collectionAddress.label} · ` : ''}
        {job.collectionAddress?.pincode ? `PIN ${job.collectionAddress.pincode}` : 'Home collection'}
      </Text>
      <Text style={styles.meta}>{formatSlot(job.slotDateTime)}</Text>
      <View style={styles.cardFooter}>
        <Text style={styles.amount}>{formatCurrency(job.amount)}</Text>
      </View>
      {disabled && !accepting ? (
        <GhostButton testID={`btn-accept-${job._id}`} label="Finish your active job first" onPress={undefined} disabled />
      ) : (
        <BigAction
          testID={`btn-accept-${job._id}`}
          icon="check"
          label="Accept"
          hint={`${formatCurrency(job.amount)} · ${job.paymentMode === 'cash' ? 'collect cash' : 'prepaid'}`}
          tone="go"
          onPress={onAccept}
          loading={accepting}
        />
      )}
    </Card>
  );
}

const styles = StyleSheet.create({
  sectionLabel: { ...type.label, color: colors.muted, marginTop: 8, marginBottom: 10, textTransform: 'uppercase', letterSpacing: 0.6 },
  card: { marginBottom: 14, gap: 6 },
  meta: { ...type.meta, lineHeight: 17, flex: 1 },
  metaRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  cardFooter: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 4 },
  amount: { fontSize: 17, fontWeight: '800', color: colors.ink },
  action: { marginTop: 12 },
});
