import { Worker } from 'bullmq';
import { getRedisClient, closeRedis } from '../src/config/redisConfig.js';
import { processPaymentJob } from '../src/processors/paymentProcessor.js';
import { processRiderAllocationJob } from '../src/processors/riderProcessor.js';

/**
 * Redis-backed runtime for integration suites.
 *
 * Two problems this solves, both of which were hidden while no Redis was
 * running and appeared the moment one was:
 *
 * 1. SHARED STATE. Every suite used `redis://localhost:6379`, which is database
 *    0, and Jest runs suites in parallel. Rate-limit counters and the rider geo
 *    index are global keys, so suites overwrote each other. With Redis absent
 *    every call fell through to the in-memory fallback, which is per-process and
 *    therefore isolated by accident. setupRedisIsolation.js gives each worker
 *    its own database; this file clears it between suites.
 *
 * 2. NOBODY CONSUMING THE QUEUE. Producers call `queue.add()` and only fall back
 *    to an inline `setImmediate` when that THROWS. With no Redis it always threw,
 *    so the payment-webhook tests exercised the fallback and never the real
 *    queue. With a real Redis the add succeeds, the job sits there, and nothing
 *    consumes it — `src/worker.js` is a separate process. Running the processors
 *    here means the tests drive the path production uses:
 *    producer -> Redis -> worker -> processor.
 *
 * Scoped to integration suites. Unit tests need none of it, and opening a Redis
 * connection for them leaves a handle that stops Jest exiting.
 */
const QUEUE_PROCESSORS = [
  ['payment-webhooks', processPaymentJob],
  ['rider-allocation', processRiderAllocationJob],
];

const workers = [];
let redisReady = false;

function suitePath() {
  // Windows paths use backslashes; split/join avoids escaping them in a regex.
  return (expect.getState()?.testPath ?? '').split('\\').join('/');
}

function isIntegrationSuite() {
  return suitePath().includes('/tests/integration/');
}

/**
 * Only the suites that actually enqueue need a live processor.
 *
 * Starting BullMQ workers for all nineteen integration suites was destabilising
 * the run: BullMQ duplicates the ioredis connection per worker, and
 * `redisConfig`'s retryStrategy gives up after three attempts — so under that
 * connection churn a client could die mid-suite and every later call silently
 * fell back to the in-memory store. Rate-limit counts then split across two
 * stores and the failures moved around between runs.
 */
const QUEUE_CONSUMING_SUITES = ['payment', 'transactions', 'webhook', 'riderMatching', 'booking'];

function needsQueueWorkers() {
  const path = suitePath();
  return QUEUE_CONSUMING_SUITES.some((name) => path.includes(`/${name}`));
}

beforeAll(async () => {
  if (!isIntegrationSuite()) return;

  let connection;
  try {
    connection = getRedisClient();
    await connection.ping();
    redisReady = true;
  } catch {
    // No Redis: the producers' inline fallback covers the work and the
    // in-memory rate-limit store is already per-process.
    return;
  }

  await connection.flushdb();

  if (!needsQueueWorkers()) return;

  for (const [queueName, processor] of QUEUE_PROCESSORS) {
    try {
      workers.push(
        new Worker(queueName, processor, {
          connection,
          concurrency: 5,
          // Suites wait on these; a slow drain reads as a flaky test.
          drainDelay: 1,
        })
      );
    } catch {
      /* a queue that will not start is covered by the producer fallback */
    }
  }
});

afterAll(async () => {
  // Workers first: closing the connection under a live worker throws.
  await Promise.all(
    workers.map(async (worker) => {
      try {
        await worker.close();
      } catch {
        /* already gone */
      }
    })
  );
  workers.length = 0;

  if (!redisReady) return;

  try {
    await getRedisClient().flushdb();
  } catch {
    /* nothing to clear */
  }
  try {
    // Leaves no open handle keeping Jest alive.
    await closeRedis();
  } catch {
    /* already closed */
  }
  redisReady = false;
});
