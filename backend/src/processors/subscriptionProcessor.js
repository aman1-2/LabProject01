import { subscriptionRepository } from '../repositories/subscriptionRepository.js';
import { enqueuePushNotification } from '../producers/notificationProducer.js';
import { SUBSCRIPTION_CONFIG } from '../config/subscriptionConfig.js';
import { isFeatureEnabled } from '../config/featureFlags.js';
import logger from '../utils/logger.js';

/**
 * The recurring sweep.
 *
 * IT SENDS PRE-DEBIT NOTICES. IT DOES NOT CREATE BOOKINGS AND IT DOES NOT
 * CHARGE. Razorpay owns the debit; a booking exists only once a charge is
 * confirmed by webhook. Keeping those powers out of this file is what makes
 * "a failed charge creates no booking" structural rather than conditional.
 *
 * RBI mandates notice at least 24h before every recurring debit on an
 * e-mandate. That is a compliance requirement, so the notice is recorded
 * (preDebitNotifiedFor / preDebitNotifiedAt) and claimed atomically — one
 * notice per cycle, provably.
 */
export async function processSubscriptionSweepJob() {
  if (!isFeatureEnabled('SUBSCRIPTIONS')) {
    return { status: 'skipped', reason: 'feature_disabled' };
  }

  const now = new Date();

  // Everything charging between the notice floor and the window ceiling.
  // The window is wider than the 24h floor on purpose: if a sweep is late or
  // skipped, a narrow window would silently produce a debit with NO notice,
  // which is worse than a notice sent slightly early.
  const noticeFloor = new Date(now.getTime() + SUBSCRIPTION_CONFIG.preDebitNoticeHours * 3600 * 1000);
  const to = new Date(now.getTime() + SUBSCRIPTION_CONFIG.preDebitWindowHours * 3600 * 1000);

  // Deliberately queried from NOW, not from the 24h floor. A sweep that was
  // late or skipped leaves cycles charging in under 24h; starting the window at
  // the floor would skip those permanently and the debit would go out with no
  // notice at all. Notifying late is a shortfall we can see and report;
  // notifying never is one we cannot.
  const due = await subscriptionRepository.findDueForPreDebitNotice({ from: now, to });

  let notified = 0;
  let skipped = 0;
  let shortNotice = 0;

  for (const subscription of due) {
    // Only notify once we are inside the notice window; anything charging
    // further out gets picked up by a later sweep.
    if (subscription.nextScheduledDate > to) {
      skipped += 1;
      continue;
    }

    // Atomic claim: two overlapping sweeps cannot both notify for one cycle.
    const claimed = await subscriptionRepository.claimPreDebitNotice({
      subscriptionId: subscription._id,
      cycleDate: subscription.nextScheduledDate,
      notifiedAt: now,
    });

    if (!claimed) {
      skipped += 1;
      continue;
    }

    const packageName = subscription.packageId?.name ?? 'your test package';
    const chargeDate = new Date(subscription.nextScheduledDate);

    // The notice is going out with less than the mandated lead time. The notice
    // is still sent — the alternative is none at all — but this is a compliance
    // shortfall and has to be visible rather than absorbed silently.
    if (chargeDate < noticeFloor) {
      shortNotice += 1;
      logger.error('Pre-debit notice is shorter than the RBI minimum', {
        subscriptionId: String(subscription._id),
        chargeDate,
        requiredNoticeHours: SUBSCRIPTION_CONFIG.preDebitNoticeHours,
        actualNoticeHours: Math.round((chargeDate - now) / 3600000),
      });
    }

    try {
      await enqueuePushNotification({
        userId: subscription.patientId,
        title: 'Upcoming payment',
        // Plain language, and it states amount and date because the point of
        // the notice is that the patient can stop it (DESIGN_SPEC §6).
        body: `₹${subscription.amount.toLocaleString('en-IN')} for ${packageName} will be debited on ${chargeDate.toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}. You can pause or cancel before then.`,
        data: {
          type: 'SUBSCRIPTION_PRE_DEBIT',
          subscriptionId: String(subscription._id),
          amount: subscription.amount,
          chargeDate: chargeDate.toISOString(),
        },
      });
      notified += 1;
    } catch (error) {
      // The claim is already recorded, so a failed enqueue would otherwise
      // mean silence for this cycle. Undo it so the next sweep retries.
      logger.error('Pre-debit notification failed to enqueue; releasing the claim', {
        subscriptionId: String(subscription._id),
        error: error.message,
      });
      await subscriptionRepository.claimPreDebitNotice({
        subscriptionId: subscription._id,
        cycleDate: null,
        notifiedAt: null,
      });
    }
  }

  logger.info('Subscription pre-debit sweep complete', {
    considered: due.length,
    notified,
    skipped,
    shortNotice,
  });
  return { status: 'completed', considered: due.length, notified, skipped, shortNotice };
}

export default { processSubscriptionSweepJob };
