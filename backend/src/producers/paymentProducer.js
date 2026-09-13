import { getPaymentQueue } from '../queues/paymentQueue.js';
import logger from '../utils/logger.js';

/**
 * Enqueue payment webhook event into BullMQ.
 * Includes graceful asynchronous event loop fallback if Redis queue is unavailable.
 *
 * @param {Object} params
 * @param {Object} params.event
 * @returns {Promise<void>}
 */
export async function enqueuePaymentWebhookEvent({ event, eventId = null }) {
  try {
    const queue = getPaymentQueue();
    if (queue) {
      await queue.add('razorpay-event', { event, eventId }, {
        attempts: 3,
        backoff: { type: 'exponential', delay: 2000 },
        removeOnComplete: 100,
        removeOnFail: 500,
      });
      return;
    }
  } catch (err) {
    logger.warn('Failed to enqueue to BullMQ queue, falling back to setImmediate async execution', {
      error: err.message,
    });
  }

  // Graceful fallback for environments where Redis connection is offline or mocked in unit tests
  setImmediate(async () => {
    try {
      const { processPaymentJob } = await import('../processors/paymentProcessor.js');
      await processPaymentJob({ data: { event, eventId } });
    } catch (fallbackErr) {
      logger.error('Async payment fallback processor failed', { error: fallbackErr.message });
    }
  });
}

export default {
  enqueuePaymentWebhookEvent,
};
