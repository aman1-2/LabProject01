import { Subscription } from '../schemas/Subscription.js';

/**
 * Subscription persistence. Queries only — every business rule lives in
 * subscriptionService.
 */

export async function createSubscription(data, session = null) {
  const [created] = await Subscription.create([data], session ? { session } : {});
  return created;
}

export async function findById(id) {
  return Subscription.findById(id)
    .populate('packageId', 'name slug category basePrice turnaroundHrs')
    .populate('labCenterId', 'name area');
}

/** Scoped to the owner: an unowned subscription must be indistinguishable from a missing one. */
export async function findByIdAndOwner(id, patientId) {
  return Subscription.findOne({ _id: id, patientId })
    .populate('packageId', 'name slug category basePrice turnaroundHrs')
    .populate('labCenterId', 'name area');
}

export async function findByPatient(patientId) {
  return Subscription.find({ patientId })
    .sort({ createdAt: -1 })
    .populate('packageId', 'name slug category basePrice turnaroundHrs')
    .populate('labCenterId', 'name area');
}

export async function findByRazorpayId(razorpaySubscriptionId) {
  if (!razorpaySubscriptionId) return null;
  return Subscription.findOne({ razorpaySubscriptionId });
}

/**
 * Has this webhook event already been applied to any subscription?
 *
 * Mirrors paymentRepository.hasProcessedEvent. The authoritative guard is the
 * conditional update below; this is the cheap early exit.
 */
export async function hasProcessedEvent(eventId) {
  if (!eventId) return false;
  const exists = await Subscription.exists({ webhookEventIds: eventId });
  return Boolean(exists);
}

/**
 * Claim a webhook event for a subscription, atomically.
 *
 * The filter carries `webhookEventIds: { $ne: eventId }`, so two concurrent
 * deliveries of the same event race on the database and exactly one wins. The
 * loser gets null and does nothing — which is what makes "a redelivered charge
 * creates no second booking" a database guarantee rather than a timing hope.
 */
export async function claimWebhookEvent({ subscriptionId, eventId, session = null }) {
  if (!eventId) return null;

  return Subscription.findOneAndUpdate(
    { _id: subscriptionId, webhookEventIds: { $ne: eventId } },
    { $push: { webhookEventIds: eventId } },
    { new: true, ...(session ? { session } : {}) }
  );
}

/**
 * Records a successful cycle: links the booking and moves the schedule on.
 *
 * Only ever called from the confirmed-charge path.
 */
export async function recordSuccessfulCharge({
  subscriptionId,
  bookingId,
  nextScheduledDate,
  chargedAt,
  session = null,
}) {
  return Subscription.findOneAndUpdate(
    { _id: subscriptionId },
    {
      $set: {
        nextScheduledDate,
        lastChargeAt: chargedAt,
        lastChargeStatus: 'succeeded',
        status: 'active',
        mandateStatus: 'active',
        // Cleared so the next cycle gets its own pre-debit notice.
        preDebitNotifiedFor: null,
        preDebitNotifiedAt: null,
      },
      $push: { bookingIds: bookingId },
    },
    { new: true, ...(session ? { session } : {}) }
  );
}

/**
 * Records a failed cycle.
 *
 * Deliberately does NOT touch nextScheduledDate: a charge that did not happen
 * must not move the schedule, or the patient loses a cycle they paid nothing
 * for and the retry window closes silently.
 */
export async function recordFailedCharge({ subscriptionId, failedAt, session = null }) {
  return Subscription.findOneAndUpdate(
    { _id: subscriptionId },
    { $set: { lastChargeAt: failedAt, lastChargeStatus: 'failed' } },
    { new: true, ...(session ? { session } : {}) }
  );
}

/** Subscriptions whose next charge falls inside the pre-debit notice window. */
export async function findDueForPreDebitNotice({ from, to }) {
  return Subscription.find({
    status: 'active',
    nextScheduledDate: { $gte: from, $lte: to },
    $or: [{ preDebitNotifiedFor: null }, { preDebitNotifiedFor: { $ne: null, $lt: from } }],
  }).populate('packageId', 'name slug');
}

/**
 * Claim the pre-debit notification for one cycle, atomically.
 *
 * The filter requires the flag to still be unset FOR THIS CYCLE, so two
 * overlapping sweeps cannot both notify. Sending the same debit notice twice
 * is not merely noisy — it is a compliance record that misstates what happened.
 */
export async function claimPreDebitNotice({ subscriptionId, cycleDate, notifiedAt }) {
  return Subscription.findOneAndUpdate(
    {
      _id: subscriptionId,
      status: 'active',
      $or: [{ preDebitNotifiedFor: null }, { preDebitNotifiedFor: { $ne: cycleDate } }],
    },
    { $set: { preDebitNotifiedFor: cycleDate, preDebitNotifiedAt: notifiedAt } },
    { new: true }
  );
}

/** Atomic status change with the permitted prior states in the filter. */
export async function transitionStatus({ subscriptionId, from, to, extra = {} }) {
  return Subscription.findOneAndUpdate(
    { _id: subscriptionId, status: { $in: from } },
    { $set: { status: to, ...extra } },
    { new: true }
  );
}

export const subscriptionRepository = {
  createSubscription,
  findById,
  findByIdAndOwner,
  findByPatient,
  findByRazorpayId,
  hasProcessedEvent,
  claimWebhookEvent,
  recordSuccessfulCharge,
  recordFailedCharge,
  findDueForPreDebitNotice,
  claimPreDebitNotice,
  transitionStatus,
};

export default subscriptionRepository;
