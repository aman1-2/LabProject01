// backend/src/processors/notificationProcessor.js
import { sendPushToUser } from '../services/pushNotificationService.js';
import logger from '../utils/logger.js';

/**
 * Delivers one queued push. Runs in the worker process, so a slow or failing
 * push service never blocks a request handler (CONTEXT §10).
 */
export async function processNotificationJob(job) {
  const { userId, title, body, data } = job.data || {};

  if (!userId || !title) {
    logger.warn('Malformed notification job skipped', { jobId: job?.id });
    return { status: 'skipped', reason: 'malformed_job' };
  }

  const result = await sendPushToUser({ userId, title, body, data });
  return { status: result.sent ? 'sent' : 'not_sent', ...result };
}

export default { processNotificationJob };
