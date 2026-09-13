import logger from '../utils/logger.js';
import paymentService from '../services/paymentService.js';
import subscriptionService from '../services/subscriptionService.js';

/**
 * Core processor for Razorpay payment webhook jobs
 *
 * @param {Object} job - BullMQ job containing { event }
 * @returns {Promise<Object>}
 */
export async function processPaymentJob(job) {
  const { event, eventId: suppliedEventId } = job.data;
  if (!event) {
    logger.warn('Empty payment job received');
    return { status: 'skipped', reason: 'empty_event' };
  }

  const eventType = event.event;
  // Supplied by the controller from the x-razorpay-event-id header; the body
  // fields are fallbacks for synthetic payloads only.
  const eventId = suppliedEventId || event.id || event.event_id;
  logger.info(`Processing payment webhook event: ${eventType}`, { eventId });

  if (eventType === 'payment.captured' || eventType === 'order.paid') {
    const paymentEntity = event.payload?.payment?.entity;
    const orderEntity = event.payload?.order?.entity;

    const gatewayOrderId = paymentEntity?.order_id || orderEntity?.id;
    const gatewayPaymentId = paymentEntity?.id;
    const amount = paymentEntity?.amount ? paymentEntity.amount / 100 : undefined;

    return paymentService.handlePaymentCaptured({
      gatewayOrderId,
      gatewayPaymentId,
      eventId,
      amount,
    });
  }

  // ── Subscription (UPI AutoPay) events ────────────────────────────────────
  //
  // `subscription.charged` is the ONLY event that produces a booking, and it
  // fires only when the debit has actually succeeded. Every failure path below
  // deliberately has no route to booking creation.
  if (eventType?.startsWith('subscription.')) {
    const subscriptionEntity = event.payload?.subscription?.entity;
    const razorpaySubscriptionId = subscriptionEntity?.id;

    if (!razorpaySubscriptionId) {
      logger.warn('Subscription webhook carried no subscription id', { eventType });
      return { status: 'skipped', reason: 'missing_subscription_id' };
    }

    if (eventType === 'subscription.charged') {
      return subscriptionService.applyConfirmedCharge({
        razorpaySubscriptionId,
        eventId,
        chargedAt: event.created_at ? new Date(event.created_at * 1000) : new Date(),
      });
    }

    // A halted mandate means the bank has stopped honouring it, usually after
    // repeated failures. It is a state change, not a charge — no booking.
    if (eventType === 'subscription.pending') {
      return subscriptionService.applyFailedCharge({
        razorpaySubscriptionId,
        eventId,
        failedAt: event.created_at ? new Date(event.created_at * 1000) : new Date(),
      });
    }

    return subscriptionService.applyMandateStateChange({
      razorpaySubscriptionId,
      eventType,
      eventId,
      gatewayStatus: subscriptionEntity?.status,
    });
  }

  /**
   * A payment failure on a subscription invoice. Explicitly routed to the
   * failure path so it can never be mistaken for a charge.
   */
  if (eventType === 'payment.failed') {
    const paymentEntity = event.payload?.payment?.entity;
    const razorpaySubscriptionId = paymentEntity?.subscription_id;

    if (razorpaySubscriptionId) {
      return subscriptionService.applyFailedCharge({
        razorpaySubscriptionId,
        eventId,
        failedAt: new Date(),
      });
    }
  }

  logger.info(`Unhandled webhook event type: ${eventType}`);
  return { status: 'unhandled_event_type', eventType };
}

export default {
  processPaymentJob,
};
