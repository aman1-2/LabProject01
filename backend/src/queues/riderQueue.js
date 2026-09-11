// backend/src/queues/riderQueue.js
import { Queue } from 'bullmq';
import { getQueueConnection } from '../config/redisConfig.js';
import logger from '../utils/logger.js';

let riderQueue = null;

export function getRiderQueue() {
  if (!riderQueue) {
    try {
      riderQueue = new Queue('rider-allocation', {
        connection: getQueueConnection(),
      });
    } catch (err) {
      logger.warn('Could not initialize BullMQ rider allocation queue', { error: err.message });
    }
  }
  return riderQueue;
}

export default {
  getRiderQueue,
};
