// backend/src/queues/notificationQueue.js
import { Queue } from 'bullmq';
import { getQueueConnection } from '../config/redisConfig.js';
import logger from '../utils/logger.js';

let notificationQueue = null;

export function getNotificationQueue() {
  if (!notificationQueue) {
    try {
      notificationQueue = new Queue('notifications', {
        connection: getQueueConnection(),
      });
    } catch (err) {
      logger.warn('Could not initialize BullMQ notification queue', { error: err.message });
    }
  }
  return notificationQueue;
}

export default { getNotificationQueue };
