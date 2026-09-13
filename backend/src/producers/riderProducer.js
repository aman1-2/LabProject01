import { getRiderQueue } from '../queues/riderQueue.js';
import logger from '../utils/logger.js';

/**
 * Enqueue rider allocation job into BullMQ.
 * Includes graceful asynchronous event loop fallback if Redis queue is offline.
 *
 * @param {Object} params
 * @param {string} params.bookingId
 * @param {string} [params.labCenterId]
 * @param {Object} [params.coordinates]
 * @returns {Promise<void>}
 */
export async function enqueueRiderAllocation({ bookingId, labCenterId, coordinates }) {
  try {
    const queue = getRiderQueue();
    if (queue) {
      await queue.add('allocate-rider', { bookingId, labCenterId, coordinates }, {
        attempts: 3,
        backoff: { type: 'exponential', delay: 2000 },
        removeOnComplete: 100,
        removeOnFail: 500,
      });
      return;
    }
  } catch (err) {
    logger.warn('Failed to enqueue to BullMQ rider queue, falling back to setImmediate async execution', {
      error: err.message,
    });
  }

  // Fallback for tests or offline Redis
  setImmediate(async () => {
    try {
      const { processRiderAllocationJob } = await import('../processors/riderProcessor.js');
      await processRiderAllocationJob({ data: { bookingId, labCenterId, coordinates } });
    } catch (fallbackErr) {
      logger.error('Async rider allocation fallback failed', { error: fallbackErr.message });
    }
  });
}

export default {
  enqueueRiderAllocation,
};
