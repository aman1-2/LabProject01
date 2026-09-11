import { jest } from '@jest/globals';
import request from 'supertest';
import { MongoMemoryServer } from 'mongodb-memory-server';
import createApp from '../../src/app.js';
import { connectDB, disconnectDB } from '../../src/config/dbConfig.js';
import { resetRateLimitStore } from '../../src/middlewares/rateLimiter.js';

/**
 * CORS with more than one allowed origin.
 *
 * `CORS_ORIGIN` was handed to the cors middleware as the raw environment
 * string. With a single origin that works by accident. With two it emits
 * `Access-Control-Allow-Origin: http://a,http://b`, which no browser accepts —
 * the spec allows exactly one origin or `*` — so every cross-origin request
 * fails with an opaque CORS error that looks like a browser or network fault
 * rather than a config one.
 *
 * This bites precisely when a second origin is added: a staging domain, or a
 * LAN address for testing the web app from a phone.
 */
describe('CORS with multiple allowed origins', () => {
  let mongoServer;
  let app;
  const ORIGINAL = process.env.CORS_ORIGIN;

  beforeAll(async () => {
    mongoServer = await MongoMemoryServer.create({ instance: { dbName: 'pathcare_cors_test' } });
    await connectDB(mongoServer.getUri());
  });

  afterAll(async () => {
    if (ORIGINAL === undefined) delete process.env.CORS_ORIGIN;
    else process.env.CORS_ORIGIN = ORIGINAL;
    await disconnectDB();
    if (mongoServer) await mongoServer.stop();
  });

  beforeEach(async () => {
    await resetRateLimitStore();
  });

  /**
   * serverConfig reads the environment at import time, so the module registry
   * is reset to pick up a new value.
   */
  async function appWithOrigins(value) {
    process.env.CORS_ORIGIN = value;
    jest.resetModules();
    const { default: freshCreateApp } = await import('../../src/app.js');
    return freshCreateApp();
  }

  it('echoes back the single origin that matched, not the whole list', async () => {
    app = await appWithOrigins('http://localhost:5173,http://127.0.0.1:5173');

    const res = await request(app)
      .get('/api/health')
      .set('Origin', 'http://127.0.0.1:5173');

    expect(res.headers['access-control-allow-origin']).toBe('http://127.0.0.1:5173');
    // The bug: the comma-joined list, which a browser rejects outright.
    expect(res.headers['access-control-allow-origin']).not.toContain(',');
  });

  it('allows the other configured origin too', async () => {
    app = await appWithOrigins('http://localhost:5173,http://127.0.0.1:5173');

    const res = await request(app).get('/api/health').set('Origin', 'http://localhost:5173');

    expect(res.headers['access-control-allow-origin']).toBe('http://localhost:5173');
  });

  it('does not allow an origin that is not configured', async () => {
    app = await appWithOrigins('http://localhost:5173');

    const res = await request(app).get('/api/health').set('Origin', 'https://evil.example');

    expect(res.headers['access-control-allow-origin']).toBeUndefined();
  });

  it('tolerates whitespace around the separators', async () => {
    // A hand-edited .env is the normal way this value is set.
    app = await appWithOrigins('http://localhost:5173 , http://127.0.0.1:5173');

    const res = await request(app).get('/api/health').set('Origin', 'http://127.0.0.1:5173');

    expect(res.headers['access-control-allow-origin']).toBe('http://127.0.0.1:5173');
  });

  it('still works with exactly one origin configured', async () => {
    app = await appWithOrigins('http://localhost:5173');

    const res = await request(app).get('/api/health').set('Origin', 'http://localhost:5173');

    expect(res.headers['access-control-allow-origin']).toBe('http://localhost:5173');
  });
});
