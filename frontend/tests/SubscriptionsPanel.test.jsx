import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom';
import { MemoryRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

const fetchSubscriptions = vi.fn();
const pauseSubscription = vi.fn();
const resumeSubscription = vi.fn();
const cancelSubscription = vi.fn();

vi.mock('@pathcare/api', async () => {
  const actual = await vi.importActual('@pathcare/api');
  return {
    ...actual,
    fetchSubscriptions: (...args) => fetchSubscriptions(...args),
    pauseSubscription: (...args) => pauseSubscription(...args),
    resumeSubscription: (...args) => resumeSubscription(...args),
    cancelSubscription: (...args) => cancelSubscription(...args),
  };
});

const SubscriptionsPanel = (await import('../src/components/organisms/SubscriptionsPanel.jsx'))
  .default;

/**
 * The subscriptions panel.
 *
 * This replaced a stub that showed a hardcoded "Active" chip and a Cancel
 * button wired to nothing, against fields the Subscription model does not have.
 * These cover what the patient can actually see and do.
 */
function renderPanel() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0 } },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter>
        <SubscriptionsPanel />
      </MemoryRouter>
    </QueryClientProvider>
  );
}

const activePlan = {
  _id: 'sub1',
  status: 'active',
  amount: 599,
  frequencyDays: 90,
  nextScheduledDate: new Date(Date.now() + 5 * 86400000).toISOString(),
  packageId: { name: 'Diabetes Care Plan' },
  labCenterId: { name: 'Sunrise Diagnostics' },
};

describe('SubscriptionsPanel', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    fetchSubscriptions.mockResolvedValue({ items: [] });
  });

  it('shows an empty state that says what will appear', async () => {
    renderPanel();
    expect(await screen.findByTestId('subscriptions-empty-state')).toBeInTheDocument();
    expect(screen.getByText(/collects your samples on a schedule/i)).toBeInTheDocument();
  });

  it('surfaces a load failure rather than an empty list', async () => {
    // An error rendered as "no plans" would tell a patient they have no
    // recurring payments when they may well have several.
    fetchSubscriptions.mockRejectedValue({ message: 'Server unavailable' });
    renderPanel();

    expect(await screen.findByTestId('subscriptions-error')).toBeInTheDocument();
    expect(screen.queryByTestId('subscriptions-empty-state')).not.toBeInTheDocument();
  });

  it('leads with the next payment amount and date', async () => {
    fetchSubscriptions.mockResolvedValue({ items: [activePlan] });
    renderPanel();

    const nextCharge = await screen.findByTestId('next-charge');
    // Indian digit grouping, per DESIGN_SPEC §6.
    expect(nextCharge).toHaveTextContent('₹599');
    expect(nextCharge).toHaveTextContent(/in 5 days/i);
    expect(screen.getByText('Diabetes Care Plan')).toBeInTheDocument();
    expect(screen.getByText(/Quarterly/)).toBeInTheDocument();
  });

  it('pauses a plan', async () => {
    fetchSubscriptions.mockResolvedValue({ items: [activePlan] });
    pauseSubscription.mockResolvedValue({});
    renderPanel();

    fireEvent.click(await screen.findByTestId('btn-pause-sub1'));

    await waitFor(() => expect(pauseSubscription).toHaveBeenCalledWith('sub1'));
    expect(await screen.findByTestId('subscription-notice')).toHaveTextContent(
      /nothing will be debited/i
    );
  });

  it('confirms before cancelling, and does not cancel if dismissed', async () => {
    fetchSubscriptions.mockResolvedValue({ items: [activePlan] });
    renderPanel();

    fireEvent.click(await screen.findByTestId('btn-cancel-sub1'));
    expect(await screen.findByText(/Cancel this care plan\?/i)).toBeInTheDocument();

    // Ending a mandate the patient set up deliberately should not happen on a
    // stray click.
    fireEvent.click(screen.getByText(/Keep it/i));
    await waitFor(() => expect(cancelSubscription).not.toHaveBeenCalled());
  });

  it('cancels once confirmed', async () => {
    fetchSubscriptions.mockResolvedValue({ items: [activePlan] });
    cancelSubscription.mockResolvedValue({});
    renderPanel();

    fireEvent.click(await screen.findByTestId('btn-cancel-sub1'));
    fireEvent.click(await screen.findByTestId('btn-confirm-cancel'));

    await waitFor(() => expect(cancelSubscription).toHaveBeenCalledWith('sub1'));
  });

  it('offers resume, not pause, on a paused plan', async () => {
    fetchSubscriptions.mockResolvedValue({
      items: [{ ...activePlan, status: 'paused' }],
    });
    renderPanel();

    expect(await screen.findByTestId('btn-resume-sub1')).toBeInTheDocument();
    expect(screen.queryByTestId('btn-pause-sub1')).not.toBeInTheDocument();
    expect(screen.getByText(/Paused — nothing will be debited/i)).toBeInTheDocument();
  });

  it('prompts for mandate approval and says nothing has been charged', async () => {
    fetchSubscriptions.mockResolvedValue({
      items: [
        {
          ...activePlan,
          status: 'pending_authorization',
          authorizationUrl: 'https://rzp.io/i/test',
        },
      ],
    });
    renderPanel();

    expect(await screen.findByTestId('authorize-sub1')).toHaveAttribute(
      'href',
      'https://rzp.io/i/test'
    );
    expect(screen.getByText(/Nothing has been charged/i)).toBeInTheDocument();
    // No next-charge block: there is no scheduled debit yet.
    expect(screen.queryByTestId('next-charge')).not.toBeInTheDocument();
  });

  it('explains a halted mandate in the patient’s terms, not the gateway’s', async () => {
    fetchSubscriptions.mockResolvedValue({ items: [{ ...activePlan, status: 'halted' }] });
    renderPanel();

    expect(await screen.findByText(/Your bank stopped this mandate/i)).toBeInTheDocument();
    // "Halted" is gateway jargon and must not be what the patient reads.
    expect(screen.getByTestId('subscription-status-sub1')).toHaveTextContent(
      /Stopped by your bank/i
    );
  });

  it('offers no pause or cancel on a cancelled plan', async () => {
    fetchSubscriptions.mockResolvedValue({ items: [{ ...activePlan, status: 'cancelled' }] });
    renderPanel();

    await screen.findByTestId('subscription-sub1');
    expect(screen.queryByTestId('btn-pause-sub1')).not.toBeInTheDocument();
    expect(screen.queryByTestId('btn-cancel-sub1')).not.toBeInTheDocument();
    expect(screen.getByText(/No further payments/i)).toBeInTheDocument();
  });
});
