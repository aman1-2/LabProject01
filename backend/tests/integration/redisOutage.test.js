import request from 'supertest';
import { MongoMemoryServer } from 'mongodb-memory-server';
import createApp from '../../src/app.js';
import { connectDB, disconnectDB } from '../../src/config/dbConfig.js';
import { TestCatalog } from '../../src/schemas/TestCatalog.js';
import { getRedisClient, getQueueConnection, closeRedis } from '../../src/config/redisConfig.js';
import { resetRateLimitStore } from '../../src/middlewares/rateLimiter.js';

/**
 * The API keeps serving when Redis is unavailable.
 *
 * A Redis outage must be a DEGRADATION, not an outage. Rate limits fall back
 * to the in-memory store, the cache misses, queued work uses the inline
 * fallback — and requests still get answered.
 *
 * The regression this pins: making the client retry forever (so a transient
 * outage heals) was combined with `maxRetriesPerRequest: null` and ioredis's
 * offline queue, which means a command issued while Redis is down is buffered
 * indefinitely rather than failing. `globalRateLimiter` awaits Redis on every
 * request, so the process listened on its port and answered nothing — a total
 * outage, strictly worse than the permanent-degradation bug being fixed.
 *
 * Every test here runs with REDIS_URL pointing at a port nothing listens on,
 * which is how the suite runs by default (tests/setupRedisIsolation.js).
 */
describe('Serving with Redis unavailable', () => {
  let mongoServer;
  let app;

  beforeAll(async () => {
    mongoServer = await MongoMemoryServer.create({ instance: { dbName: 'pathcare_redis_outage' } });
    await connectDB(mongoServer.getUri());
    app = createApp();

    await TestCatalog.create({
      name: 'Complete Blood Count (CBC)',
      slug: 'cbc-outage',
      category: 'single',
      sampleType: 'Blood',
      homeCollectionAvailable: true,
      basePrice: 299,
      turnaroundHrs: 6,
      description: 'Measures red cells, white cells, haemoglobin and platelets.',
      prepInstructions: 'No fasting required.',
    });
  });

  afterAll(async () => {
    await TestCatalog.deleteMany({});
    await closeRedis();
    await disconnectDB();
    if (mongoServer) await mongoServer.stop();
  });

  beforeEach(async () => {
    await resetRateLimitStore();
  });

  it('confirms Redis really is unreachable for this suite', async () => {
    // Otherwise the rest of the file proves nothing.
    const client = getRedisClient();
    await expect(client.ping()).rejects.toThrow();
  });

  it('answers a public catalogue request', async () => {
    const res = await request(app).get('/api/tests').query({ category: 'single' });

    expect(res.status).toBe(200);
    expect(res.body.data.items.map((i) => i.slug)).toContain('cbc-outage');
  });

  it('answers within a normal request budget rather than hanging', async () => {
    // The failure mode was an indefinite hang, which a status assertion alone
    // would never catch — the request simply never returns.
    const startedAt = Date.now();
    const res = await request(app).get('/api/tests');
    const elapsed = Date.now() - startedAt;

    expect(res.status).toBe(200);
    expect(elapsed).toBeLessThan(5000);
  });

  it('serves many consecutive requests without the offline queue backing up', async () => {
    // Buffered commands accumulate; the tenth request is where that shows.
    for (let i = 0; i < 10; i += 1) {
      const res = await request(app).get('/api/tests');
      expect(res.status).toBe(200);
    }
  });

  it('reports itself degraded rather than healthy', async () => {
    const res = await request(app).get('/api/health');

    expect(res.status).toBe(200);
    expect(res.body.db).toBe('connected');
    // Honest: Redis is genuinely down, and the health endpoint says so.
    expect(res.body.redis).toBe('disconnected');
    expect(res.body.status).toBe('degraded');
  });

  it('still rate-limits, using the in-memory fallback', async () => {
    // The fallback is the reason failing fast matters — losing rate limiting
    // entirely during an outage would be its own problem.
    const res = await request(app).get('/api/tests');
    expect(res.status).toBe(200);
  });

  it('gives the queue connection different settings from the request path', () => {
    // BullMQ requires maxRetriesPerRequest: null and a working offline queue.
    // Those are exactly the settings that make a REQUEST hang, so the two
    // clients must not be the same object.
    const requestClient = getRedisClient();
    const queueClient = getQueueConnection();

    expect(queueClient).not.toBe(requestClient);
    expect(requestClient.options.enableOfflineQueue).toBe(false);
    expect(requestClient.options.maxRetriesPerRequest).toBe(1);
    expect(queueClient.options.maxRetriesPerRequest).toBeNull();
  });
});
