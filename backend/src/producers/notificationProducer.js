import { getNotificationQueue } from '../queues/notificationQueue.js';
import logger from '../utils/logger.js';

/**
 * Enqueue a push. NEVER awaited for its delivery result by a request handler —
 * a notification failing must not fail the operation that triggered it.
 */
export async function enqueuePushNotification({ userId, title, body, data = {} }) {
  const payload = { userId: userId?.toString(), title, body, data };

  try {
    const queue = getNotificationQueue();
    if (queue) {
      await queue.add('push', payload, {
        attempts: 3,
        backoff: { type: 'exponential', delay: 5000 },
        removeOnComplete: 100,
        removeOnFail: 500,
      });
      return;
    }
  } catch (err) {
    logger.warn('Could not enqueue notification; falling back to inline dispatch', {
      error: err.message,
    });
  }

  // Fallback for environments without a Redis-backed queue. Deliberately not
  // awaited by the caller.
  setImmediate(async () => {
    try {
      const { processNotificationJob } = await import('../processors/notificationProcessor.js');
      await processNotificationJob({ data: payload });
    } catch (err) {
      logger.warn('Inline notification fallback failed', { error: err.message });
    }
  });
}

export default { enqueuePushNotification };
