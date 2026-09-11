import { describe, it, expect, beforeAll, afterAll, jest } from '@jest/globals';
import request from 'supertest';
import { MongoMemoryServer } from 'mongodb-memory-server';

// ES module namespaces are read-only, so Redis cannot be stubbed with jest.spyOn.
// Replace the module before app.js pulls it in, so the health check reports a
// connected Redis without this suite depending on a live Redis server.
jest.unstable_mockModule('../../src/config/redisConfig.js', () => ({
  isRedisConnected: jest.fn().mockResolvedValue(true),
  // What the health check actually calls. A probe asks whether Redis is
  // reachable, which is not the same question the request path asks.
  checkRedisHealth: jest.fn().mockResolvedValue(true),
  getRedisStatus: jest.fn(() => 'ready'),
  getRedisClient: jest.fn(() => null),
  // BullMQ's connection is a separate client from the request-path one; the
  // queues import this, so the mock has to provide it or app.js fails to load.
  getQueueConnection: jest.fn(() => null),
  createRedisClient: jest.fn(() => null),
  closeRedis: jest.fn().mockResolvedValue(undefined),
  default: {},
}));

const { default: createApp } = await import('../../src/app.js');
const { connectDB, disconnectDB } = await import('../../src/config/dbConfig.js');

describe('GET /health Integration Test', () => {
  let mongoServer;
  let app;

  beforeAll(async () => {
    mongoServer = await MongoMemoryServer.create();
    const uri = mongoServer.getUri();
    await connectDB(uri);

    app = createApp();
  });

  afterAll(async () => {
    await disconnectDB();
    if (mongoServer) {
      await mongoServer.stop();
    }
  });

  it('should return 200 with status ok and db/redis connected', async () => {
    const res = await request(app).get('/health');

    expect(res.status).toBe(200);
    expect(res.body.status).toBe('ok');
    expect(res.body.db).toBe('connected');
    expect(res.body.redis).toBe('connected');
    expect(typeof res.body.uptime).toBe('number');
    expect(res.body.timestamp).toBeDefined();
  });

  it('should return 404 for unknown endpoints with standard AppError shape', async () => {
    const res = await request(app).get('/api/v1/non-existent-endpoint');

    expect(res.status).toBe(404);
    expect(res.body.success).toBe(false);
    expect(res.body.error.code).toBe('RESOURCE_NOT_FOUND');
  });
});
