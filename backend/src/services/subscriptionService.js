import mongoose from 'mongoose';
import { subscriptionRepository } from '../repositories/subscriptionRepository.js';
import * as addressRepository from '../repositories/addressRepository.js';
import { findTestById, findTestBySlug } from '../repositories/testRepository.js';
import { findLabById } from '../repositories/labRepository.js';
import { Booking } from '../schemas/Booking.js';
import { bookingService } from './bookingService.js';
import razorpaySubscriptionService from './razorpaySubscriptionService.js';
import { runInTransaction } from '../utils/transactionHelper.js';
import { isFeatureEnabled } from '../config/featureFlags.js';
import { SUBSCRIPTION_CONFIG } from '../config/subscriptionConfig.js';
import { AppError } from '../utils/AppError.js';
import logger from '../utils/logger.js';

/**
 * Recurring test packages.
 *
 * THE RULE THIS FILE EXISTS TO ENFORCE
 * ------------------------------------
 * A booking is created if and only if a charge is CONFIRMED. There is exactly
 * one code path from money to a booking — `applyConfirmedCharge` — and it is
 * reachable only from a `subscription.charged` webhook.
 *
 * The daily sweep schedules and notifies. It does not create bookings, does not
 * call the gateway to charge, and cannot advance a schedule. That is deliberate
 * structure rather than discipline: if the sweep could create bookings, "failed
 * charge creates no booking" would be a conditional someone could later invert.
 * As written there is no path from a failure to a booking to invert.
 */

function addDays(date, days) {
  const next = new Date(date);
  next.setDate(next.getDate() + days);
  return next;
}

/** Resolve a package by id or slug, and refuse anything that is not one. */
async function resolvePackage(packageIdOrSlug) {
  let pkg = null;
  if (mongoose.Types.ObjectId.isValid(packageIdOrSlug)) {
    pkg = await findTestById(packageIdOrSlug);
  }
  if (!pkg) {
    pkg = await findTestBySlug(packageIdOrSlug);
  }
  if (!pkg) {
    throw new AppError('Package not found in catalogue', 404, 'PACKAGE_NOT_FOUND');
  }
  if (!['package', 'plan'].includes(pkg.category)) {
    throw new AppError(
      'Only packages and care plans can be subscribed to',
      422,
      'NOT_SUBSCRIBABLE'
    );
  }
  return pkg;
}

/**
 * Create a subscription and hand back the mandate authorisation URL.
 *
 * The subscription starts `pending_authorization`: no charge can happen and no
 * cycle is scheduled until the gateway tells us the mandate is live.
 */
export async function createSubscription({ patientId, packageId, labCenterId, frequencyDays, addressId, mode = 'home' }) {
  if (!isFeatureEnabled('SUBSCRIPTIONS')) {
    throw new AppError('Subscriptions are not available yet', 404, 'FEATURE_DISABLED');
  }

  const pkg = await resolvePackage(packageId);

  const lab = await findLabById(labCenterId);
  if (!lab || lab.isVerified === false) {
    throw new AppError('Lab centre not found', 404, 'LAB_CENTER_NOT_FOUND');
  }

  const interval = Number(frequencyDays) || SUBSCRIPTION_CONFIG.defaultFrequencyDays;
  if (!SUBSCRIPTION_CONFIG.allowedFrequencyDays.includes(interval)) {
    throw new AppError(
      `Interval must be one of: ${SUBSCRIPTION_CONFIG.allowedFrequencyDays.join(', ')} days`,
      422,
      'INVALID_FREQUENCY'
    );
  }

  // Price is computed server-side from the live catalogue and the lab's
  // multiplier — never supplied by the client (CONTEXT §3.2). This is the
  // amount the mandate will authorise, and it is frozen onto the subscription.
  const amount = Math.round(pkg.basePrice * (lab.priceMultiplier || 1));

  // Home collection needs somewhere to collect from, snapshotted so a later
  // edit to the address book cannot redirect an in-flight cycle.
  let collectionAddress = null;
  if (mode === 'home') {
    if (!addressId) {
      throw new AppError('addressId is required for home collection', 422, 'ADDRESS_REQUIRED');
    }
    const address = await addressRepository.findByIdAndOwner(addressId, patientId);
    if (!address) {
      throw new AppError('Address not found', 404, 'ADDRESS_NOT_FOUND');
    }
    collectionAddress = {
      addressId: address._id,
      label: address.label,
      line: address.line,
      pincode: address.pincode,
      lat: address.lat,
      lng: address.lng,
    };
  }

  // Gateway calls first, and OUTSIDE any transaction (see the note in
  // razorpaySubscriptionService): a mandate is an external HTTP round trip.
  const plan = await razorpaySubscriptionService.createPlan({
    name: `${pkg.name} — every ${interval} days`,
    amount,
    frequencyDays: interval,
  });

  const gatewaySubscription = await razorpaySubscriptionService.createGatewaySubscription({
    planId: plan.id,
    totalCount: SUBSCRIPTION_CONFIG.maxCyclesPerMandate,
    notes: { patientId: String(patientId), packageSlug: pkg.slug },
  });

  const subscription = await subscriptionRepository.createSubscription({
    patientId,
    packageId: pkg._id,
    labCenterId: lab._id,
    frequencyDays: interval,
    amount,
    mode,
    collectionAddress,
    // Provisional. The authoritative first cycle comes from the gateway when
    // the mandate is authorised.
    nextScheduledDate: addDays(new Date(), interval),
    status: 'pending_authorization',
    mandateStatus: 'created',
    razorpayPlanId: plan.id,
    razorpaySubscriptionId: gatewaySubscription.id,
    authorizationUrl: gatewaySubscription.short_url || null,
  });

  logger.info('Subscription created, awaiting mandate authorization', {
    subscriptionId: subscription._id.toString(),
    razorpaySubscriptionId: gatewaySubscription.id,
  });

  return subscription;
}

export async function listForPatient(patientId) {
  return subscriptionRepository.findByPatient(patientId);
}

export async function getForPatient({ subscriptionId, patientId }) {
  if (!mongoose.Types.ObjectId.isValid(subscriptionId)) {
    // 404 not 403 — an unowned resource must be indistinguishable from a
    // missing one, or the id space becomes enumerable (CONTEXT §3.2).
    throw new AppError('Subscription not found', 404, 'SUBSCRIPTION_NOT_FOUND');
  }
  const subscription = await subscriptionRepository.findByIdAndOwner(subscriptionId, patientId);
  if (!subscription) {
    throw new AppError('Subscription not found', 404, 'SUBSCRIPTION_NOT_FOUND');
  }
  return subscription;
}

export async function pauseSubscription({ subscriptionId, patientId }) {
  const subscription = await getForPatient({ subscriptionId, patientId });

  if (subscription.status !== 'active') {
    throw new AppError(`Cannot pause a subscription that is ${subscription.status}`, 422, 'INVALID_SUBSCRIPTION_STATE');
  }

  if (subscription.razorpaySubscriptionId) {
    await razorpaySubscriptionService.pauseGatewaySubscription(subscription.razorpaySubscriptionId);
  }

  const updated = await subscriptionRepository.transitionStatus({
    subscriptionId: subscription._id,
    from: ['active'],
    to: 'paused',
    extra: { mandateStatus: 'paused', pausedAt: new Date() },
  });

  if (!updated) {
    throw new AppError('Subscription changed while pausing; try again', 409, 'SUBSCRIPTION_CONFLICT');
  }
  return updated;
}

export async function resumeSubscription({ subscriptionId, patientId }) {
  const subscription = await getForPatient({ subscriptionId, patientId });

  if (subscription.status !== 'paused') {
    throw new AppError(`Cannot resume a subscription that is ${subscription.status}`, 422, 'INVALID_SUBSCRIPTION_STATE');
  }

  if (subscription.razorpaySubscriptionId) {
    await razorpaySubscriptionService.resumeGatewaySubscription(subscription.razorpaySubscriptionId);
  }

  const updated = await subscriptionRepository.transitionStatus({
    subscriptionId: subscription._id,
    from: ['paused'],
    to: 'active',
    extra: { mandateStatus: 'active', pausedAt: null },
  });

  if (!updated) {
    throw new AppError('Subscription changed while resuming; try again', 409, 'SUBSCRIPTION_CONFLICT');
  }
  return updated;
}

export async function cancelSubscription({ subscriptionId, patientId, reason = null }) {
  const subscription = await getForPatient({ subscriptionId, patientId });

  if (subscription.status === 'cancelled') {
    // Already where the patient wants to be. Erroring would be pedantic.
    return subscription;
  }

  if (subscription.razorpaySubscriptionId) {
    try {
      await razorpaySubscriptionService.cancelGatewaySubscription(subscription.razorpaySubscriptionId);
    } catch (error) {
      // A mandate already cancelled at the bank makes the gateway call fail,
      // and refusing to cancel locally would leave the patient unable to stop
      // something that has in fact already stopped.
      logger.warn('Gateway cancel failed; cancelling locally anyway', {
        subscriptionId: String(subscription._id),
        error: error.message,
      });
    }
  }

  const updated = await subscriptionRepository.transitionStatus({
    subscriptionId: subscription._id,
    from: ['pending_authorization', 'active', 'paused', 'halted'],
    to: 'cancelled',
    extra: { mandateStatus: 'cancelled', cancelledAt: new Date(), cancelReason: reason },
  });

  return updated ?? subscription;
}

// ───────────────────────────────────────────────────────────────────────────
// Webhook-driven state. The only place a cycle can produce a booking.
// ───────────────────────────────────────────────────────────────────────────

/**
 * A CONFIRMED charge: create exactly one booking and move the schedule on.
 *
 * Both effects happen in one transaction with the event-id claim, so a
 * redelivery cannot produce a second booking and a booking cannot exist
 * without its schedule having advanced.
 */
export async function applyConfirmedCharge({ razorpaySubscriptionId, eventId, chargedAt = new Date() }) {
  const subscription = await subscriptionRepository.findByRazorpayId(razorpaySubscriptionId);
  if (!subscription) {
    logger.warn('Charge webhook for an unknown subscription', { razorpaySubscriptionId });
    return { status: 'unknown_subscription' };
  }

  if (subscription.status === 'cancelled') {
    // A charge against a cancelled mandate is a gateway/bank race. Recording a
    // booking for it would commit a phlebotomist to a visit nobody expects.
    logger.warn('Charge webhook for a cancelled subscription; no booking created', {
      subscriptionId: String(subscription._id),
    });
    return { status: 'cancelled_subscription' };
  }

  return runInTransaction(
    async (session) => {
      // Claim the event FIRST. The loser of a concurrent redelivery gets null
      // here and never reaches booking creation.
      const claimed = await subscriptionRepository.claimWebhookEvent({
        subscriptionId: subscription._id,
        eventId,
        session,
      });

      if (!claimed) {
        logger.info('Subscription charge event already applied; ignoring redelivery', { eventId });
        return { status: 'duplicate', subscriptionId: String(subscription._id) };
      }

      const booking = await bookingService.createSubscriptionBooking({
        subscription,
        chargedAt,
        session,
      });

      const nextScheduledDate = addDays(
        subscription.nextScheduledDate ?? chargedAt,
        subscription.frequencyDays
      );

      await subscriptionRepository.recordSuccessfulCharge({
        subscriptionId: subscription._id,
        bookingId: booking._id,
        nextScheduledDate,
        chargedAt,
        session,
      });

      logger.info('Subscription cycle billed and booking created', {
        subscriptionId: String(subscription._id),
        bookingId: String(booking._id),
        nextScheduledDate,
      });

      return {
        status: 'charged',
        subscriptionId: String(subscription._id),
        bookingId: String(booking._id),
        nextScheduledDate,
      };
    },
    { label: 'subscription.applyConfirmedCharge' }
  );
}

/**
 * A FAILED charge: record it and change nothing else.
 *
 * No booking. `nextScheduledDate` untouched, so the gateway's retry lands on
 * the same cycle rather than one the patient has silently lost.
 */
export async function applyFailedCharge({ razorpaySubscriptionId, eventId, failedAt = new Date() }) {
  const subscription = await subscriptionRepository.findByRazorpayId(razorpaySubscriptionId);
  if (!subscription) {
    return { status: 'unknown_subscription' };
  }

  const claimed = await subscriptionRepository.claimWebhookEvent({
    subscriptionId: subscription._id,
    eventId,
  });

  if (!claimed) {
    return { status: 'duplicate', subscriptionId: String(subscription._id) };
  }

  const scheduleBefore = subscription.nextScheduledDate;

  await subscriptionRepository.recordFailedCharge({
    subscriptionId: subscription._id,
    failedAt,
  });

  logger.warn('Subscription charge failed; no booking created, schedule unchanged', {
    subscriptionId: String(subscription._id),
    nextScheduledDate: scheduleBefore,
  });

  return {
    status: 'charge_failed',
    subscriptionId: String(subscription._id),
    bookingCreated: false,
    nextScheduledDate: scheduleBefore,
  };
}

/**
 * Mandate lifecycle events, including changes made OUTSIDE the app — a patient
 * revoking the mandate in their bank's UPI app is the common case, and we only
 * ever learn about it here.
 */
export async function applyMandateStateChange({ razorpaySubscriptionId, eventType, eventId, gatewayStatus }) {
  const subscription = await subscriptionRepository.findByRazorpayId(razorpaySubscriptionId);
  if (!subscription) {
    return { status: 'unknown_subscription' };
  }

  const claimed = await subscriptionRepository.claimWebhookEvent({
    subscriptionId: subscription._id,
    eventId,
  });
  if (!claimed) {
    return { status: 'duplicate' };
  }

  const MAP = {
    'subscription.authenticated': { status: 'active', mandateStatus: 'authenticated' },
    'subscription.activated': { status: 'active', mandateStatus: 'active' },
    'subscription.paused': { status: 'paused', mandateStatus: 'paused' },
    'subscription.resumed': { status: 'active', mandateStatus: 'active' },
    // Halted: the bank has stopped honouring the mandate (usually repeated
    // failures). No further cycles should be scheduled.
    'subscription.halted': { status: 'halted', mandateStatus: 'halted' },
    'subscription.cancelled': { status: 'cancelled', mandateStatus: 'cancelled' },
    'subscription.completed': { status: 'cancelled', mandateStatus: 'expired' },
  };

  const target = MAP[eventType];
  if (!target) {
    return { status: 'unhandled_event_type', eventType };
  }

  const extra = { mandateStatus: target.mandateStatus };
  if (target.status === 'cancelled') extra.cancelledAt = new Date();
  if (target.status === 'paused') extra.pausedAt = new Date();

  const updated = await subscriptionRepository.transitionStatus({
    subscriptionId: subscription._id,
    from: ['pending_authorization', 'active', 'paused', 'halted'],
    to: target.status,
    extra,
  });

  logger.info('Subscription mandate state changed', {
    subscriptionId: String(subscription._id),
    eventType,
    gatewayStatus,
    newStatus: updated?.status ?? subscription.status,
  });

  return { status: 'mandate_updated', newStatus: updated?.status ?? subscription.status };
}

/** How many bookings this subscription has produced — used by the tests. */
export async function countBookingsFor(subscriptionId) {
  return Booking.countDocuments({ subscriptionId });
}

export const subscriptionService = {
  createSubscription,
  listForPatient,
  getForPatient,
  pauseSubscription,
  resumeSubscription,
  cancelSubscription,
  applyConfirmedCharge,
  applyFailedCharge,
  applyMandateStateChange,
  countBookingsFor,
};

export default subscriptionService;
