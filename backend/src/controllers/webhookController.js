import paymentService from '../services/paymentService.js';
import paymentRepository from '../repositories/paymentRepository.js';
import { subscriptionRepository } from '../repositories/subscriptionRepository.js';
import { enqueuePaymentWebhookEvent } from '../producers/paymentProducer.js';
import logger from '../utils/logger.js';

/**
 * Handle incoming Razorpay webhooks per PATHCARE_CONTEXT.md §6.2.
 * Invariants:
 * 1. Verify HMAC over rawBody
 * 2. Return 200 immediately (ACK)
 * 3. Dedupe on event_id (repeat delivery is a no-op)
 * 4. Process asynchronously via queue
 */
export async function handleRazorpayWebhook(req, res, next) {
  try {
    const signature = req.headers['x-razorpay-signature'];
    const rawBody = req.rawBody;

    // 1. Verify HMAC over the RAW body
    if (!paymentService.verifyWebhookSignature(rawBody, signature)) {
      logger.warn('Razorpay webhook signature verification failed');
      return res.status(400).send('invalid signature');
    }

    // 2. Return 200 IMMEDIATELY (ACK)
    res.status(200).send('ok');

    // 3. Dedupe on event id — a repeat delivery is a no-op (CONTEXT §3.3).
    //
    // Razorpay sends the event identifier in the x-razorpay-event-id HEADER.
    // The body carries `event`, `payload`, `created_at` and `account_id` but no
    // top-level `id`, so the previous `req.body.id` read was always undefined
    // and this guard never once fired. The body fallbacks are retained only for
    // synthetic payloads that do include an id.
    const eventId =
      req.headers['x-razorpay-event-id'] || req.body?.id || req.body?.event_id;

    if (eventId) {
      // Event ids live on Payment for one-off payments and on Subscription for
      // recurring ones, so both are consulted. This is only the cheap early
      // exit — the authoritative guard is the atomic claim inside each service,
      // which is what makes a redelivery safe under concurrency.
      const [paidAlready, subscribedAlready] = await Promise.all([
        paymentRepository.hasProcessedEvent(eventId),
        subscriptionRepository.hasProcessedEvent(eventId),
      ]);
      const alreadyProcessed = paidAlready || subscribedAlready;
      if (alreadyProcessed) {
        logger.info(`Webhook event ${eventId} is a repeat delivery. Ignored.`);
        return;
      }
    } else {
      logger.warn('Razorpay webhook carried no event id; cannot dedupe this delivery');
    }

    // 4. Process asynchronously via BullMQ queue. eventId travels with the job
    //    so the processor does not have to re-derive it from the body.
    await enqueuePaymentWebhookEvent({ event: req.body, eventId });
  } catch (error) {
    logger.error('Error handling Razorpay webhook', { error: error.message });
    next(error);
  }
}

export default {
  handleRazorpayWebhook,
};
