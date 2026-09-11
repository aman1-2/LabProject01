import React, { useState } from 'react';
import { Linking, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  fetchSubscriptions,
  pauseSubscription,
  resumeSubscription,
  cancelSubscription,
  subscriptionKeys,
  SUBSCRIPTION_STATUS,
} from '@pathcare/api';
import { colors, type, card, layout } from '../theme.js';
import { Banner, Card, Chip, EmptyState, ErrorState, ScreenHeader } from '../components/ui.jsx';
import { Pressable3D, SkeletonList, FadeInView, elevation, notifySuccess, notifyWarning } from '../components/motion.jsx';
import Icon from '../components/Icon.jsx';
import { formatCurrency } from '../lib/format.js';

/**
 * Recurring test packages.
 *
 * Two things drive the layout, both because this screen is about money leaving
 * someone's account on a schedule they are not watching:
 *
 *  - The NEXT CHARGE — amount and date — is the largest thing on every card.
 *    A subscription the patient has forgotten is the one that hurts.
 *  - Pause and cancel are always reachable in one tap, never behind a menu.
 *    RBI requires a pre-debit notice precisely so the patient can act on it;
 *    burying the action would make that notice decorative.
 */

function formatCycleDate(value) {
  if (!value) return '—';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '—';
  return date.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
}

function daysUntil(value) {
  if (!value) return null;
  const diff = new Date(value).getTime() - Date.now();
  return Math.ceil(diff / 86400000);
}

function cadenceLabel(days) {
  return { 30: 'Monthly', 60: 'Every 2 months', 90: 'Quarterly', 180: 'Every 6 months', 365: 'Yearly' }[days]
    ?? `Every ${days} days`;
}

export default function SubscriptionsScreen({ navigation }) {
  const queryClient = useQueryClient();
  const [notice, setNotice] = useState(null);

  const query = useQuery({
    queryKey: subscriptionKeys.all(),
    queryFn: () => fetchSubscriptions(),
  });

  const invalidate = () => queryClient.invalidateQueries({ queryKey: subscriptionKeys.all() });

  const pauseMutation = useMutation({
    mutationFn: (id) => pauseSubscription(id),
    onSuccess: () => {
      notifySuccess();
      setNotice('Paused. Nothing will be debited until you resume.');
      invalidate();
    },
    onError: (err) => setNotice(err?.message || 'Could not pause that subscription.'),
  });

  const resumeMutation = useMutation({
    mutationFn: (id) => resumeSubscription(id),
    onSuccess: () => {
      notifySuccess();
      setNotice('Resumed. Your next collection is scheduled.');
      invalidate();
    },
    onError: (err) => setNotice(err?.message || 'Could not resume that subscription.'),
  });

  const cancelMutation = useMutation({
    mutationFn: (id) => cancelSubscription(id),
    onSuccess: () => {
      notifyWarning();
      setNotice('Cancelled. No further payments will be taken.');
      invalidate();
    },
    onError: (err) => setNotice(err?.message || 'Could not cancel that subscription.'),
  });

  const items = query.data?.items ?? query.data ?? [];
  const busyId =
    pauseMutation.variables ?? resumeMutation.variables ?? cancelMutation.variables ?? null;
  const isBusy = pauseMutation.isPending || resumeMutation.isPending || cancelMutation.isPending;

  return (
    <View style={layout.screen} testID="screen-subscriptions">
      <ScreenHeader title="Subscriptions" onBack={navigation.goBack} />

      {notice ? <Banner tone="blue" text={notice} testID="subscription-notice" /> : null}

      <ScrollView contentContainerStyle={styles.body}>
        {query.isLoading ? <SkeletonList count={2} /> : null}

        {query.isError ? (
          <ErrorState
            message={
              query.error?.isNetworkError
                ? 'No connection. Your subscriptions will load when you are back online.'
                : query.error?.message
            }
            onRetry={query.refetch}
          />
        ) : null}

        {!query.isLoading && !query.isError && items.length === 0 ? (
          <EmptyState
            testID="empty-subscriptions"
            icon="repeat"
            title="No subscriptions yet"
            message="Subscribe to a care plan and we'll collect your samples on a schedule — you'll get a reminder before every payment."
            ctaLabel="Browse care plans"
            onCta={() => navigation.navigate('TestsTab', { category: 'plan' })}
          />
        ) : null}

        {items.map((subscription, index) => (
          <FadeInView key={subscription._id} delay={index * 60}>
            <SubscriptionCard
              subscription={subscription}
              busy={isBusy && busyId === subscription._id}
              onPause={() => pauseMutation.mutate(subscription._id)}
              onResume={() => resumeMutation.mutate(subscription._id)}
              onCancel={() => cancelMutation.mutate(subscription._id)}
              onAuthorize={() =>
                subscription.authorizationUrl &&
                Linking.openURL(subscription.authorizationUrl).catch(() => {})
              }
            />
          </FadeInView>
        ))}
      </ScrollView>
    </View>
  );
}

function SubscriptionCard({ subscription, busy, onPause, onResume, onCancel, onAuthorize }) {
  const status = SUBSCRIPTION_STATUS[subscription.status] ?? { label: subscription.status, tone: 'grey' };
  const isActive = subscription.status === 'active';
  const isPaused = subscription.status === 'paused';
  const needsApproval = subscription.status === 'pending_authorization';
  const isDead = ['cancelled', 'halted'].includes(subscription.status);

  const days = daysUntil(subscription.nextScheduledDate);
  const packageName = subscription.packageId?.name ?? 'Care plan';

  return (
    <Card style={[card.padded, styles.card, elevation.card]} testID={`subscription-${subscription._id}`}>
      <View style={styles.headerRow}>
        <View style={styles.headerText}>
          <Text style={styles.packageName} numberOfLines={2}>
            {packageName}
          </Text>
          <View style={styles.cadenceRow}>
            <Icon name="repeat" size={13} color={colors.muted} strokeWidth={2.2} />
            <Text style={styles.cadence}>{cadenceLabel(subscription.frequencyDays)}</Text>
          </View>
        </View>
        <Chip label={status.label} tone={status.tone} testID={`subscription-status-${subscription._id}`} />
      </View>

      {/* The next debit is the most important fact on this card. */}
      {isActive ? (
        <View style={styles.nextCharge} testID="next-charge">
          <View>
            <Text style={styles.nextLabel}>Next payment</Text>
            <Text style={styles.nextAmount}>{formatCurrency(subscription.amount)}</Text>
          </View>
          <View style={styles.nextDateBlock}>
            <Text style={styles.nextDate}>{formatCycleDate(subscription.nextScheduledDate)}</Text>
            {days !== null && days >= 0 ? (
              <Text style={styles.nextIn}>{days === 0 ? 'today' : days === 1 ? 'tomorrow' : `in ${days} days`}</Text>
            ) : null}
          </View>
        </View>
      ) : (
        <View style={styles.inertRow}>
          <Text style={styles.inertAmount}>{formatCurrency(subscription.amount)}</Text>
          <Text style={styles.inertLabel}>
            {isPaused
              ? 'Paused — nothing will be debited'
              : needsApproval
                ? 'Not active until you approve the mandate'
                : 'No further payments'}
          </Text>
        </View>
      )}

      {needsApproval ? (
        <Banner
          tone="amber"
          testID="banner-awaiting-mandate"
          text="Approve the UPI AutoPay mandate in your bank app to start this plan. Nothing has been charged."
        />
      ) : null}

      {subscription.status === 'halted' ? (
        <Banner
          tone="red"
          testID="banner-halted"
          text="Your bank stopped this mandate, usually after a failed payment. Set it up again to continue."
        />
      ) : null}

      {subscription.collectionAddress?.line ? (
        <View style={styles.metaRow}>
          <Icon name="mapPin" size={13} color={colors.muted2} strokeWidth={2.2} />
          <Text style={styles.meta} numberOfLines={1}>
            {subscription.collectionAddress.line}
          </Text>
        </View>
      ) : null}

      {/* Pause and cancel stay one tap away — see the note at the top. */}
      <View style={styles.actions}>
        {needsApproval && subscription.authorizationUrl ? (
          <Pressable3D
            testID={`btn-authorize-${subscription._id}`}
            onPress={onAuthorize}
            style={[styles.action, styles.actionPrimary]}
            haptic="medium"
          >
            <Icon name="shield" size={15} color={colors.white} />
            <Text style={styles.actionPrimaryLabel}>Approve mandate</Text>
          </Pressable3D>
        ) : null}

        {isActive ? (
          <Pressable3D
            testID={`btn-pause-${subscription._id}`}
            onPress={onPause}
            disabled={busy}
            style={[styles.action, styles.actionGhost, busy && styles.actionBusy]}
          >
            <Icon name="pause" size={15} color={colors.ink} />
            <Text style={styles.actionGhostLabel}>Pause</Text>
          </Pressable3D>
        ) : null}

        {isPaused ? (
          <Pressable3D
            testID={`btn-resume-${subscription._id}`}
            onPress={onResume}
            disabled={busy}
            style={[styles.action, styles.actionPrimary, busy && styles.actionBusy]}
            haptic="medium"
          >
            <Icon name="play" size={15} color={colors.white} />
            <Text style={styles.actionPrimaryLabel}>Resume</Text>
          </Pressable3D>
        ) : null}

        {!isDead ? (
          <Pressable3D
            testID={`btn-cancel-${subscription._id}`}
            onPress={onCancel}
            disabled={busy}
            style={[styles.action, styles.actionDanger, busy && styles.actionBusy]}
            haptic="medium"
          >
            <Icon name="x" size={15} color={colors.redDark} />
            <Text style={styles.actionDangerLabel}>Cancel</Text>
          </Pressable3D>
        ) : null}
      </View>
    </Card>
  );
}

const styles = StyleSheet.create({
  body: { paddingHorizontal: 20, paddingBottom: 60 },
  card: { marginBottom: 16, gap: 12 },
  headerRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12 },
  headerText: { flex: 1, gap: 4 },
  packageName: { fontSize: 15.5, fontWeight: '800', color: colors.ink, letterSpacing: -0.2 },
  cadenceRow: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  cadence: { ...type.meta, fontWeight: '700' },
  // The next debit, given the visual weight it deserves.
  nextCharge: {
    backgroundColor: colors.blue50,
    borderRadius: 16,
    padding: 14,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: 12,
  },
  nextLabel: { ...type.meta, textTransform: 'uppercase', letterSpacing: 0.6, fontWeight: '700' },
  nextAmount: { fontSize: 24, fontWeight: '800', color: colors.ink, letterSpacing: -0.6, marginTop: 2 },
  nextDateBlock: { alignItems: 'flex-end' },
  nextDate: { fontSize: 13.5, fontWeight: '800', color: colors.blue700 },
  nextIn: { ...type.meta, marginTop: 2 },
  inertRow: { gap: 3 },
  inertAmount: { fontSize: 19, fontWeight: '800', color: colors.muted },
  inertLabel: { ...type.meta },
  metaRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  meta: { ...type.meta, flex: 1 },
  actions: { flexDirection: 'row', gap: 8, flexWrap: 'wrap' },
  action: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    borderRadius: 999,
    paddingVertical: 11,
    paddingHorizontal: 18,
    minHeight: 44,
    flexGrow: 1,
  },
  actionPrimary: { backgroundColor: colors.blue600 },
  actionPrimaryLabel: { color: colors.white, fontWeight: '700', fontSize: 13.5 },
  actionGhost: { backgroundColor: colors.white, borderWidth: 1.5, borderColor: colors.border },
  actionGhostLabel: { color: colors.ink, fontWeight: '700', fontSize: 13.5 },
  actionDanger: { backgroundColor: colors.redBg },
  actionDangerLabel: { color: colors.redDark, fontWeight: '700', fontSize: 13.5 },
  actionBusy: { opacity: 0.55 },
});
