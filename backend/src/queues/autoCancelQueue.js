// backend/src/queues/autoCancelQueue.js
import { Queue } from 'bullmq';
import { getQueueConnection } from '../config/redisConfig.js';
import logger from '../utils/logger.js';

let autoCancelQueue = null;

export function getAutoCancelQueue() {
  if (!autoCancelQueue) {
    try {
      autoCancelQueue = new Queue('auto-cancel', {
        connection: getQueueConnection(),
      });
    } catch (err) {
      logger.warn('Could not initialize BullMQ auto-cancel queue', { error: err.message });
    }
  }
  return autoCancelQueue;
}

/**
 * Schedule repeatable auto-cancel sweep (e.g. every 5 minutes)
 */
export async function scheduleAutoCancelJob(everyMs = 5 * 60 * 1000) {
  const queue = getAutoCancelQueue();
  if (!queue) return null;

  try {
    const job = await queue.add(
      'auto-cancel-sweep',
      {},
      {
        repeat: {
          every: everyMs,
        },
        removeOnComplete: true,
        removeOnFail: 50,
      }
    );
    logger.info('AutoCancel repeatable job registered', { everyMs });
    return job;
  } catch (err) {
    logger.warn('Could not register repeatable auto-cancel job', { error: err.message });
    return null;
  }
}

export default {
  getAutoCancelQueue,
  scheduleAutoCancelJob,
};
