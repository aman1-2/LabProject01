import { Queue } from 'bullmq';
import { getQueueConnection } from '../config/redisConfig.js';
import { SUBSCRIPTION_CONFIG } from '../config/subscriptionConfig.js';
import logger from '../utils/logger.js';

let subscriptionQueue = null;

export function getSubscriptionQueue() {
  if (!subscriptionQueue) {
    try {
      subscriptionQueue = new Queue('subscription-billing', {
        connection: getQueueConnection(),
      });
    } catch (err) {
      logger.warn('Could not initialize BullMQ subscription queue', { error: err.message });
    }
  }
  return subscriptionQueue;
}

/**
 * Registers the recurring pre-debit sweep.
 *
 * The sweep only sends RBI pre-debit notices — it never charges and never
 * creates bookings. See processors/subscriptionProcessor.js.
 */
export async function scheduleSubscriptionSweep(everyMs = SUBSCRIPTION_CONFIG.sweepIntervalMs) {
  const queue = getSubscriptionQueue();
  if (!queue) return null;

  try {
    const job = await queue.add(
      'subscription-predebit-sweep',
      {},
      {
        repeat: { every: everyMs },
        removeOnComplete: true,
        removeOnFail: 50,
      }
    );
    logger.info('Subscription pre-debit sweep registered', { everyMs });
    return job;
  } catch (err) {
    logger.warn('Could not register subscription sweep', { error: err.message });
    return null;
  }
}

export default { getSubscriptionQueue, scheduleSubscriptionSweep };
