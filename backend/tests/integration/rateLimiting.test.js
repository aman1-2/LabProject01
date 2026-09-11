import { jest } from '@jest/globals';
import request from 'supertest';
import crypto from 'node:crypto';
import mongoose from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';
import createApp from '../../src/app.js';
import { connectDB, disconnectDB } from '../../src/config/dbConfig.js';
import User from '../../src/schemas/User.js';
import LabCenter from '../../src/schemas/LabCenter.js';
import TestCatalog from '../../src/schemas/TestCatalog.js';
import Booking from '../../src/schemas/Booking.js';
import Payment from '../../src/schemas/Payment.js';
import { generateAccessToken } from '../../src/utils/tokenUtils.js';
import { resetRateLimitStore } from '../../src/middlewares/rateLimiter.js';
import { RATE_LIMITS, isRateLimitExempt } from '../../src/config/rateLimitConfig.js';
import razorpayConfig from '../../src/config/razorpayConfig.js';

/**
 * HIGH H2 regression.
 *
 * CONTEXT §8 specifies 100 req/min per IP unauthenticated and 500 req/min per
 * authenticated user. Neither existed: rateLimiter.js implemented only the OTP
 * and login limiters, app.js mounted no global middleware, and infra/main.tf
 * declares no WAF. Every one of ~45 endpoints was unlimited, including
 * unauthenticated account-handle enumeration.
 *
 * The webhook must stay exempt (§3.3): Razorpay retries aggressively and a 429
 * there loses payment state.
 */
describe('Global rate limiting (HIGH H2)', () => {
  let mongoServer;
  let app;
  let patient;
  let patientToken;

  beforeAll(async () => {
    mongoServer = await MongoMemoryServer.create({ instance: { dbName: 'pathcare_ratelimit_test' } });
    await connectDB(mongoServer.getUri());
    app = createApp();
  });

  afterAll(async () => {
    await Promise.all([
      Payment.deleteMany({}),
      Booking.deleteMany({}),
      User.deleteMany({}),
      LabCenter.deleteMany({}),
      TestCatalog.deleteMany({}),
    ]);
    await disconnectDB();
    if (mongoServer) await mongoServer.stop();
  });

  beforeEach(async () => {
    await resetRateLimitStore();
    await User.deleteMany({});

    patient = await User.create({
      accountHandle: 'ratelimit_patient',
      phone: '9812345678',
      name: 'Rate Limit Patient',
      passwordHash: 'hash',
      role: 'patient',
      location: { lat: 30.31, lng: 78.03, address: 'Dehradun', source: 'manual' },
    });
    patientToken = generateAccessToken({
      userId: patient._id.toString(),
      accountHandle: patient.accountHandle,
      role: 'patient',
    });
  });

  afterEach(async () => {
    await resetRateLimitStore();
    jest.restoreAllMocks();
  });

  describe('unauthenticated traffic', () => {
    it('throttles an unauthenticated caller at the configured per-IP ceiling', async () => {
      const limit = RATE_LIMITS.unauthenticated.max;
      let throttled = null;

      // One past the ceiling.
      for (let i = 0; i < limit + 1; i += 1) {
        const res = await request(app).get('/api/tests');
        if (res.status === 429) {
          throttled = { at: i + 1, body: res.body };
          break;
        }
      }

      expect(throttled).not.toBeNull();
      expect(throttled.at).toBeLessThanOrEqual(limit + 1);
      expect(throttled.body.error.code).toBe('RATE_LIMIT_EXCEEDED');
    });

    it('advertises the limit and remaining budget in headers', async () => {
      const res = await request(app).get('/api/tests');

      expect(res.headers['x-ratelimit-limit']).toBe(String(RATE_LIMITS.unauthenticated.max));
      expect(Number(res.headers['x-ratelimit-remaining'])).toBeLessThan(
        RATE_LIMITS.unauthenticated.max
      );
    });

    it('sends Retry-After once throttled', async () => {
      const limit = RATE_LIMITS.unauthenticated.max;
      let throttledRes = null;

      for (let i = 0; i < limit + 1; i += 1) {
        const res = await request(app).get('/api/tests');
        if (res.status === 429) {
          throttledRes = res;
          break;
        }
      }

      expect(throttledRes).not.toBeNull();
      expect(Number(throttledRes.headers['retry-after'])).toBe(
        RATE_LIMITS.unauthenticated.windowSeconds
      );
    });

    it('closes unauthenticated account-handle enumeration', async () => {
      const limit = RATE_LIMITS.unauthenticated.max;
      let throttled = false;

      for (let i = 0; i < limit + 1; i += 1) {
        const res = await request(app)
          .post('/api/auth/handle-available')
          .send({ handle: `probe_${i}` });
        if (res.status === 429) {
          throttled = true;
          break;
        }
      }

      // Previously this endpoint could be probed without any ceiling at all.
      expect(throttled).toBe(true);
    });
  });

  describe('authenticated traffic', () => {
    it('gives an authenticated user the higher ceiling, not the anonymous one', async () => {
      const anonLimit = RATE_LIMITS.unauthenticated.max;

      // Comfortably past the anonymous ceiling, well inside the authenticated one.
      for (let i = 0; i < anonLimit + 20; i += 1) {
        const res = await request(app)
          .get('/api/bookings')
          .set('Authorization', `Bearer ${patientToken}`);
        expect(res.status).not.toBe(429);
      }
    });

    it('reports the authenticated limit in the headers', async () => {
      const res = await request(app)
        .get('/api/bookings')
        .set('Authorization', `Bearer ${patientToken}`);

      expect(res.headers['x-ratelimit-limit']).toBe(String(RATE_LIMITS.authenticated.max));
    });

    it('buckets two different users separately', async () => {
      const other = await User.create({
        accountHandle: 'ratelimit_other',
        phone: '9812345679',
        name: 'Other',
        passwordHash: 'hash',
        role: 'patient',
        location: { lat: 30.31, lng: 78.03, address: 'Dehradun', source: 'manual' },
      });
      const otherToken = generateAccessToken({
        userId: other._id.toString(),
        role: 'patient',
      });

      // Spend most of user A's budget.
      for (let i = 0; i < 60; i += 1) {
        await request(app).get('/api/bookings').set('Authorization', `Bearer ${patientToken}`);
      }

      const res = await request(app)
        .get('/api/bookings')
        .set('Authorization', `Bearer ${otherToken}`);

      expect(res.status).not.toBe(429);
      expect(Number(res.headers['x-ratelimit-remaining'])).toBe(
        RATE_LIMITS.authenticated.max - 1
      );
    });

    it('falls back to the IP bucket when the token is invalid', async () => {
      const res = await request(app)
        .get('/api/tests')
        .set('Authorization', 'Bearer not.a.valid.jwt');

      // A forged token must not buy the higher authenticated ceiling.
      expect(res.headers['x-ratelimit-limit']).toBe(String(RATE_LIMITS.unauthenticated.max));
    });
  });

  describe('payment webhook exemption (CONTEXT §3.3)', () => {
    it('recognises webhook paths as exempt under both mounts', () => {
      expect(isRateLimitExempt('/api/webhooks/razorpay')).toBe(true);
      expect(isRateLimitExempt('/webhooks/razorpay')).toBe(true);
      expect(isRateLimitExempt('/api/bookings')).toBe(false);
    });

    it('NEVER throttles the payment webhook, even far past the anonymous ceiling', async () => {
      const body = JSON.stringify({
        entity: 'event',
        event: 'payment.captured',
        payload: { payment: { entity: { id: 'pay_rl', order_id: 'order_rl', amount: 100 } } },
      });
      const signature = crypto
        .createHmac('sha256', razorpayConfig.webhookSecret)
        .update(body)
        .digest('hex');

      const overLimit = RATE_LIMITS.unauthenticated.max + 25;
      const statuses = new Set();

      for (let i = 0; i < overLimit; i += 1) {
        const res = await request(app)
          .post('/api/webhooks/razorpay')
          .set('Content-Type', 'application/json')
          .set('x-razorpay-signature', signature)
          .set('x-razorpay-event-id', `evt_rl_${i}`)
          .send(body);
        statuses.add(res.status);
      }

      // A 429 here would lose payment state on Razorpay's retries.
      expect(statuses.has(429)).toBe(false);
      expect(statuses.has(200)).toBe(true);
    });
  });

  describe('configuration (CONTEXT §3.4)', () => {
    it('exposes every §8 limit at its specified default', () => {
      expect(RATE_LIMITS.unauthenticated).toEqual({ max: 100, windowSeconds: 60 });
      expect(RATE_LIMITS.authenticated).toEqual({ max: 500, windowSeconds: 60 });
      expect(RATE_LIMITS.otpPerPhone).toEqual({ max: 5, windowSeconds: 3600 });
      expect(RATE_LIMITS.otpPerIp).toEqual({ max: 20, windowSeconds: 3600 });
      expect(RATE_LIMITS.loginPerHandle).toEqual({ max: 10, windowSeconds: 900 });
    });
  });
});
