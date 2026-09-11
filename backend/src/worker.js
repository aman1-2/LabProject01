import { Worker } from 'bullmq';
import { connectDB, disconnectDB } from './config/dbConfig.js';
import { getQueueConnection, closeRedis } from './config/redisConfig.js';
import { assertSecretsPresent } from './config/secretsConfig.js';
import logger from './utils/logger.js';

const activeWorkers = [];

export function startWorkerQueue(queueName, processorFn) {
  const worker = new Worker(queueName, processorFn, {
    // MUST be the queue connection, not the request-path one. BullMQ holds
    // long-lived blocking reads and refuses to start unless
    // `maxRetriesPerRequest` is null; the request-path client deliberately sets
    // it to 1 so an API call fails fast when Redis is down instead of hanging.
    // Passing the wrong one crashes the whole worker process on boot.
    connection: getQueueConnection(),
    concurrency: 5,
  });

  worker.on('completed', (job) => {
    logger.info(`Job completed [${queueName}]`, { jobId: job.id, name: job.name });
  });

  worker.on('failed', (job, err) => {
    logger.error(`Job failed [${queueName}]`, {
      jobId: job?.id,
      name: job?.name,
      error: err.message,
    });
  });

  activeWorkers.push(worker);
  return worker;
}

async function startWorkers() {
  // Fail fast rather than starting on a guessable key (CONTEXT §11).
  assertSecretsPresent();

  logger.info('Starting PathCare background workers...');

  try {
    await connectDB();
  } catch (err) {
    logger.warn('Worker DB connection failed — retrying in background', { error: err.message });
  }

  /**
   * Unlike the API, this process is useless without Redis: every queue lives
   * there. It keeps retrying rather than exiting, because a Redis restart
   * should heal on its own — but without this line the only symptom is an
   * endless stream of "Redis error" with no indication that the whole worker
   * is idle, or what to do about it.
   */
  try {
    // Raced against a timeout on purpose. The queue client has
    // `enableOfflineQueue: true` (BullMQ needs it), which means a command
    // issued while Redis is down is BUFFERED, not rejected — so a bare
    // `await ping()` hangs forever and this warning would never print.
    await Promise.race([
      getQueueConnection().ping(),
      new Promise((_, reject) => setTimeout(() => reject(new Error('timeout')), 3000)),
    ]);
  } catch {
    logger.warn(
      'Redis is unreachable. The worker will keep retrying, but NO queued work ' +
        'runs until it connects: no payment webhooks, no rider allocation, no ' +
        'push notifications, no subscription pre-debit notices. ' +
        'Start it with: docker compose up -d redis',
      { redisUrl: process.env.REDIS_URL || 'redis://localhost:6379' }
    );
  }

  // Sample placeholder queue worker for infrastructure verification
  startWorkerQueue('default', async (job) => {
    logger.info('Processing default queue job', { id: job.id, data: job.data });
    return { status: 'processed' };
  });

  // Razorpay payment webhook processor per CONTEXT §6.2
  const { processPaymentJob } = await import('./processors/paymentProcessor.js');
  startWorkerQueue('payment-webhooks', processPaymentJob);

  // Rider allocation processor per CONTEXT §6.1
  const { processRiderAllocationJob } = await import('./processors/riderProcessor.js');
  startWorkerQueue('rider-allocation', processRiderAllocationJob);

  // Push notification processor
  const { processNotificationJob } = await import('./processors/notificationProcessor.js');
  startWorkerQueue('notifications', processNotificationJob);

  // Auto-cancel processor for overdue unconfirmed lab visits
  const { processAutoCancelJob } = await import('./processors/autoCancelProcessor.js');
  startWorkerQueue('auto-cancel', processAutoCancelJob);
  const { scheduleAutoCancelJob } = await import('./queues/autoCancelQueue.js');
  await scheduleAutoCancelJob();

  // Subscription pre-debit sweep.
  //
  // It sends RBI pre-debit notices only. It never charges and never creates
  // bookings — a subscription booking exists solely as the result of a
  // confirmed `subscription.charged` webhook.
  const { processSubscriptionSweepJob } = await import('./processors/subscriptionProcessor.js');
  startWorkerQueue('subscription-billing', processSubscriptionSweepJob);
  const { scheduleSubscriptionSweep } = await import('./queues/subscriptionQueue.js');
  await scheduleSubscriptionSweep();

  logger.info('PathCare background workers started successfully');

  // Graceful shutdown
  const shutdown = async (signal) => {
    logger.info(`Received ${signal}. Shutting down worker process...`);
    for (const worker of activeWorkers) {
      await worker.close();
    }
    await disconnectDB();
    await closeRedis();
    logger.info('All workers and connections closed. Exiting process.');
    process.exit(0);
  };

  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));
}

startWorkers().catch((error) => {
  logger.error('Failed to start worker process', { error: error.message, stack: error.stack });
  process.exit(1);
});
