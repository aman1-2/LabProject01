import { Worker } from 'bullmq';
import { startWorkerQueue } from '../../src/worker.js';
import { getRedisClient, getQueueConnection, closeRedis } from '../../src/config/redisConfig.js';

/**
 * The worker process can actually start.
 *
 * `src/worker.js` is a separate entrypoint that no other test launches, so it
 * had no coverage at all. That gap let a real regression ship: splitting the
 * Redis clients into a fail-fast request-path client and a BullMQ queue client
 * updated the queue PRODUCERS (`src/queues/*.js`) but missed the CONSUMERS
 * here. BullMQ refuses any connection whose `maxRetriesPerRequest` is not null,
 * so `pnpm dev:worker` died on boot with
 *
 *   BullMQ: Your redis options maxRetriesPerRequest must be null.
 *
 * while every one of the 364 other tests still passed — none of them start a
 * Worker.
 *
 * These need no running Redis: BullMQ validates connection options
 * synchronously in its constructor, before any socket is opened.
 */
describe('Worker process boot', () => {
  const started = [];

  afterAll(async () => {
    await Promise.all(
      started.map(async (worker) => {
        try {
          await worker.close();
        } catch {
          /* never connected; nothing to close */
        }
      })
    );
    await closeRedis();
  });

  it('the two client shapes are genuinely different objects', () => {
    const requestClient = getRedisClient();
    const queueClient = getQueueConnection();

    expect(queueClient).not.toBe(requestClient);
  });

  it('the request-path client fails fast, which is why BullMQ cannot use it', () => {
    const requestClient = getRedisClient();

    // Fail fast so an API request degrades instead of hanging when Redis is
    // down — and precisely why it is the wrong connection for a queue.
    expect(requestClient.options.maxRetriesPerRequest).toBe(1);
    expect(requestClient.options.enableOfflineQueue).toBe(false);
  });

  it('the queue connection satisfies BullMQ requirements', () => {
    const queueClient = getQueueConnection();

    expect(queueClient.options.maxRetriesPerRequest).toBeNull();
    expect(queueClient.options.enableOfflineQueue).toBe(true);
  });

  it('startWorkerQueue does not throw — the actual regression', () => {
    // This is the assertion that would have caught it. Constructing a Worker
    // validates the connection options immediately.
    expect(() => {
      started.push(startWorkerQueue('test-boot-queue', async () => ({ ok: true })));
    }).not.toThrow();
  });

  it('rejects the request-path client, proving the guard is real', () => {
    // If this ever stops throwing, BullMQ has relaxed the rule and the split
    // above is no longer load-bearing.
    expect(
      () =>
        new Worker('test-guard-queue', async () => {}, {
          connection: getRedisClient(),
        })
    ).toThrow(/maxRetriesPerRequest must be null/i);
  });
});
