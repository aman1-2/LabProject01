import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  fetchSubscriptions,
  pauseSubscription,
  resumeSubscription,
  cancelSubscription,
  subscriptionKeys,
  SUBSCRIPTION_STATUS,
} from '@pathcare/api';
import Card from '../atoms/Card.jsx';
import Button from '../atoms/Button.jsx';
import Chip from '../atoms/Chip.jsx';
import EmptyState from '../atoms/EmptyState.jsx';
import Skeleton from '../atoms/Skeleton.jsx';
import Modal from '../atoms/Modal.jsx';

/**
 * Care plans and subscriptions.
 *
 * This replaces a stub that rendered a hardcoded "Active" chip and a Cancel
 * button with no handler, against fields (`name`, `nextDate`) the Subscription
 * model does not have. It was honestly wired to an empty array, so it showed
 * nothing rather than showing fiction — but it also could not show a real plan.
 *
 * The layout leads with the NEXT CHARGE because this is money leaving an
 * account on a schedule nobody is watching, and keeps pause/cancel one click
 * away: RBI requires a pre-debit notice so the patient can act, and burying the
 * action would make that notice decorative.
 */

function formatCurrency(amount) {
  if (amount === null || amount === undefined || Number.isNaN(Number(amount))) return '—';
  return `₹${Number(amount).toLocaleString('en-IN')}`;
}

function formatDate(value) {
  if (!value) return '—';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '—';
  return date.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
}

function daysUntil(value) {
  if (!value) return null;
  return Math.ceil((new Date(value).getTime() - Date.now()) / 86400000);
}

const CADENCE = {
  30: 'Monthly',
  60: 'Every 2 months',
  90: 'Quarterly',
  180: 'Every 6 months',
  365: 'Yearly',
};

export default function SubscriptionsPanel() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [confirmCancel, setConfirmCancel] = useState(null);
  const [notice, setNotice] = useState(null);

  const query = useQuery({
    queryKey: subscriptionKeys.all(),
    queryFn: () => fetchSubscriptions(),
  });

  const invalidate = () => queryClient.invalidateQueries({ queryKey: subscriptionKeys.all() });

  const pause = useMutation({
    mutationFn: (id) => pauseSubscription(id),
    onSuccess: () => {
      setNotice('Paused. Nothing will be debited until you resume.');
      invalidate();
    },
    onError: (error) => setNotice(error?.message || 'Could not pause that plan.'),
  });

  const resume = useMutation({
    mutationFn: (id) => resumeSubscription(id),
    onSuccess: () => {
      setNotice('Resumed. Your next collection is scheduled.');
      invalidate();
    },
    onError: (error) => setNotice(error?.message || 'Could not resume that plan.'),
  });

  const cancel = useMutation({
    mutationFn: (id) => cancelSubscription(id),
    onSuccess: () => {
      setConfirmCancel(null);
      setNotice('Cancelled. No further payments will be taken.');
      invalidate();
    },
    onError: (error) => setNotice(error?.message || 'Could not cancel that plan.'),
  });

  const items = query.data?.items ?? query.data ?? [];
  const busy = pause.isPending || resume.isPending || cancel.isPending;

  return (
    <div data-testid="subscriptions-section">
      <div className="mb-6">
        <h1 className="text-pageTitle font-extrabold text-ink">Care Plans &amp; Subscriptions</h1>
        <p className="text-bodySmall text-muted mt-0.5">
          Recurring collections billed by UPI AutoPay. We notify you before every payment, and you
          can pause or cancel at any time.
        </p>
      </div>

      {notice && (
        <div
          data-testid="subscription-notice"
          className="mb-5 p-3 bg-blue50 border border-blue100 rounded-xl text-blue700 text-xs font-semibold"
        >
          {notice}
        </div>
      )}

      {/* All three states: loading, error, empty (CONTEXT §9.4). */}
      {query.isLoading && (
        <div className="space-y-4" data-testid="subscriptions-loading">
          <Skeleton className="h-32 w-full rounded-2xl" />
          <Skeleton className="h-32 w-full rounded-2xl" />
        </div>
      )}

      {query.isError && !query.isLoading && (
        <Card className="p-8 text-center border border-red/30" data-testid="subscriptions-error">
          <p className="font-extrabold text-ink text-sm">Could not load your plans</p>
          <p className="text-muted text-xs mt-1">{query.error?.message}</p>
          <Button variant="ghost" size="small" className="mt-4" onClick={() => query.refetch()}>
            Try again
          </Button>
        </Card>
      )}

      {!query.isLoading && !query.isError && items.length === 0 && (
        <EmptyState
          icon="repeat"
          title="No care plans yet"
          body="A care plan collects your samples on a schedule — useful for diabetes or thyroid monitoring. You are reminded before every payment and can cancel any time."
          ctaText="Browse care plans"
          onCtaClick={() => navigate('/tests')}
          data-testid="subscriptions-empty-state"
        />
      )}

      {items.length > 0 && (
        <div className="space-y-4" data-testid="subscriptions-list">
          {items.map((subscription) => {
            const status = SUBSCRIPTION_STATUS[subscription.status] ?? {
              label: subscription.status,
              tone: 'grey',
            };
            const isActive = subscription.status === 'active';
            const isPaused = subscription.status === 'paused';
            const needsApproval = subscription.status === 'pending_authorization';
            const isDead = ['cancelled', 'halted'].includes(subscription.status);
            const remaining = daysUntil(subscription.nextScheduledDate);

            return (
              <Card
                key={subscription._id}
                className="p-5 border border-border"
                data-testid={`subscription-${subscription._id}`}
              >
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <p className="font-extrabold text-base text-ink">
                      {subscription.packageId?.name ?? 'Care plan'}
                    </p>
                    <p className="text-xs text-muted mt-1">
                      {CADENCE[subscription.frequencyDays] ?? `Every ${subscription.frequencyDays} days`}
                      {subscription.labCenterId?.name ? ` · ${subscription.labCenterId.name}` : ''}
                    </p>
                  </div>
                  <Chip variant={status.tone} data-testid={`subscription-status-${subscription._id}`}>
                    {status.label}
                  </Chip>
                </div>

                {/* The next debit, given the weight it deserves. */}
                {isActive ? (
                  <div
                    className="mt-4 p-4 bg-blue50 rounded-2xl flex flex-wrap items-center justify-between gap-3"
                    data-testid="next-charge"
                  >
                    <div>
                      <p className="text-[11px] font-bold uppercase tracking-wide text-muted">
                        Next payment
                      </p>
                      <p className="text-2xl font-extrabold text-ink -tracking-[0.02em]">
                        {formatCurrency(subscription.amount)}
                      </p>
                    </div>
                    <div className="text-right">
                      <p className="text-sm font-extrabold text-blue700">
                        {formatDate(subscription.nextScheduledDate)}
                      </p>
                      {remaining !== null && remaining >= 0 && (
                        <p className="text-xs text-muted mt-0.5">
                          {remaining === 0 ? 'today' : remaining === 1 ? 'tomorrow' : `in ${remaining} days`}
                        </p>
                      )}
                    </div>
                  </div>
                ) : (
                  <p className="mt-3 text-sm text-muted">
                    {formatCurrency(subscription.amount)} ·{' '}
                    {isPaused
                      ? 'Paused — nothing will be debited'
                      : needsApproval
                        ? 'Not active until you approve the mandate'
                        : 'No further payments'}
                  </p>
                )}

                {needsApproval && subscription.authorizationUrl && (
                  <div className="mt-4 p-3 bg-amberBg border border-amber/40 rounded-xl text-xs font-semibold text-ink">
                    Approve the UPI AutoPay mandate to start this plan. Nothing has been charged.{' '}
                    <a
                      href={subscription.authorizationUrl}
                      target="_blank"
                      rel="noreferrer"
                      className="text-blue600 underline font-bold"
                      data-testid={`authorize-${subscription._id}`}
                    >
                      Approve now
                    </a>
                  </div>
                )}

                {subscription.status === 'halted' && (
                  <div className="mt-4 p-3 bg-red/10 border border-red/30 rounded-xl text-xs font-semibold text-redDark">
                    Your bank stopped this mandate, usually after a failed payment. Set it up again
                    to continue.
                  </div>
                )}

                <div className="mt-4 flex flex-wrap gap-2">
                  {isActive && (
                    <Button
                      variant="ghost"
                      size="small"
                      disabled={busy}
                      onClick={() => pause.mutate(subscription._id)}
                      data-testid={`btn-pause-${subscription._id}`}
                    >
                      Pause
                    </Button>
                  )}
                  {isPaused && (
                    <Button
                      variant="primary"
                      size="small"
                      disabled={busy}
                      onClick={() => resume.mutate(subscription._id)}
                      data-testid={`btn-resume-${subscription._id}`}
                    >
                      Resume
                    </Button>
                  )}
                  {!isDead && (
                    <Button
                      variant="ghost"
                      size="small"
                      className="text-red border-red/30"
                      disabled={busy}
                      onClick={() => setConfirmCancel(subscription)}
                      data-testid={`btn-cancel-${subscription._id}`}
                    >
                      Cancel plan
                    </Button>
                  )}
                </div>
              </Card>
            );
          })}
        </div>
      )}

      {/* Cancelling ends a mandate the patient set up deliberately; a stray
          click should not do it silently. */}
      <Modal
        isOpen={Boolean(confirmCancel)}
        onClose={() => setConfirmCancel(null)}
        title="Cancel this care plan?"
      >
        <p className="text-sm text-muted leading-relaxed">
          No further payments will be taken and no more collections will be scheduled for{' '}
          <strong className="text-ink">{confirmCancel?.packageId?.name ?? 'this plan'}</strong>.
          Collections already booked are not affected.
        </p>
        <div className="mt-6 flex gap-3 justify-end">
          <Button variant="ghost" onClick={() => setConfirmCancel(null)}>
            Keep it
          </Button>
          <Button
            variant="danger"
            disabled={cancel.isPending}
            onClick={() => cancel.mutate(confirmCancel._id)}
            data-testid="btn-confirm-cancel"
          >
            {cancel.isPending ? 'Cancelling…' : 'Yes, cancel'}
          </Button>
        </div>
      </Modal>
    </div>
  );
}
