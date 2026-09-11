import { Queue } from 'bullmq';
import { getQueueConnection } from '../config/redisConfig.js';
import logger from '../utils/logger.js';

let paymentQueue = null;

export function getPaymentQueue() {
  if (!paymentQueue) {
    try {
      paymentQueue = new Queue('payment-webhooks', {
        connection: getQueueConnection(),
      });
    } catch (err) {
      logger.warn('Could not initialize BullMQ payment queue', { error: err.message });
    }
  }
  return paymentQueue;
}

export default {
  getPaymentQueue,
};
