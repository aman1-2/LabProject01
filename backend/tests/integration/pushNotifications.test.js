import { jest } from '@jest/globals';
import request from 'supertest';
import { MongoMemoryServer } from 'mongodb-memory-server';
import createApp from '../../src/app.js';
import { connectDB, disconnectDB } from '../../src/config/dbConfig.js';
import User from '../../src/schemas/User.js';
import { generateAccessToken } from '../../src/utils/tokenUtils.js';
import { resetRateLimitStore } from '../../src/middlewares/rateLimiter.js';
import {
  isValidExpoPushToken,
  sendPushToUser,
} from '../../src/services/pushNotificationService.js';

/**
 * Push notification capability (rider app prerequisite).
 *
 * None of this existed: no device-token field, no registration endpoint, no
 * dispatch path. Job assignment could not reach a phlebotomist who did not
 * happen to have the app open.
 */
describe('Push notifications', () => {
  let mongoServer;
  let app;
  let rider;
  let riderToken;
  let otherRider;
  const ORIGINAL_FETCH = globalThis.fetch;

  beforeAll(async () => {
    mongoServer = await MongoMemoryServer.create({ instance: { dbName: 'pathcare_push_test' } });
    await connectDB(mongoServer.getUri());
    app = createApp();
  });

  afterAll(async () => {
    await User.deleteMany({});
    await disconnectDB();
    if (mongoServer) await mongoServer.stop();
  });

  beforeEach(async () => {
    await resetRateLimitStore();
    await User.deleteMany({});
    process.env.FF_PUSH_NOTIFICATIONS = 'true';

    rider = await User.create({
      accountHandle: 'push_rider',
      phone: '9870000001',
      name: 'Push Rider',
      passwordHash: 'hash',
      role: 'rider',
      location: { lat: 30.31, lng: 78.03, address: 'Dehradun', source: 'manual' },
    });
    riderToken = generateAccessToken({ userId: rider._id.toString(), role: 'rider' });

    otherRider = await User.create({
      accountHandle: 'push_other',
      phone: '9870000002',
      name: 'Other Rider',
      passwordHash: 'hash',
      role: 'rider',
      location: { lat: 30.31, lng: 78.03, address: 'Dehradun', source: 'manual' },
    });
  });

  afterEach(() => {
    globalThis.fetch = ORIGINAL_FETCH;
    delete process.env.FF_PUSH_NOTIFICATIONS;
    jest.restoreAllMocks();
  });

  describe('token registration', () => {
    it('registers a valid Expo token against the calling user', async () => {
      const res = await request(app)
        .put('/api/users/me/push-token')
        .set('Authorization', `Bearer ${riderToken}`)
        .send({ expoPushToken: 'ExponentPushToken[abc123DEF456]' });

      expect(res.status).toBe(200);
      expect(res.body.data.registered).toBe(true);

      const stored = await User.findById(rider._id).select('expoPushToken');
      expect(stored.expoPushToken).toBe('ExponentPushToken[abc123DEF456]');
    });

    it('writes only to the caller, never another account', async () => {
      await request(app)
        .put('/api/users/me/push-token')
        .set('Authorization', `Bearer ${riderToken}`)
        .send({ expoPushToken: 'ExponentPushToken[mine]' });

      const untouched = await User.findById(otherRider._id).select('expoPushToken');
      expect(untouched.expoPushToken).toBeNull();
    });

    it('rejects a token that is not an Expo push token', async () => {
      const res = await request(app)
        .put('/api/users/me/push-token')
        .set('Authorization', `Bearer ${riderToken}`)
        .send({ expoPushToken: 'https://evil.example/not-a-token' });

      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe('INVALID_PUSH_TOKEN');
    });

    it('clears the token on logout / opt-out', async () => {
      await request(app)
        .put('/api/users/me/push-token')
        .set('Authorization', `Bearer ${riderToken}`)
        .send({ expoPushToken: 'ExponentPushToken[abc]' });

      const res = await request(app)
        .put('/api/users/me/push-token')
        .set('Authorization', `Bearer ${riderToken}`)
        .send({ expoPushToken: null });

      expect(res.status).toBe(200);
      expect(res.body.data.registered).toBe(false);

      const stored = await User.findById(rider._id).select('expoPushToken');
      expect(stored.expoPushToken).toBeNull();
    });

    it('requires authentication', async () => {
      const res = await request(app)
        .put('/api/users/me/push-token')
        .send({ expoPushToken: 'ExponentPushToken[abc]' });

      expect(res.status).toBe(401);
    });
  });

  describe('token shape', () => {
    it('accepts both Expo token spellings and rejects junk', () => {
      expect(isValidExpoPushToken('ExponentPushToken[xxx]')).toBe(true);
      expect(isValidExpoPushToken('ExpoPushToken[xxx]')).toBe(true);
      expect(isValidExpoPushToken('')).toBe(false);
      expect(isValidExpoPushToken(null)).toBe(false);
      expect(isValidExpoPushToken('javascript:alert(1)')).toBe(false);
    });
  });

  describe('delivery', () => {
    it('sends to the registered device', async () => {
      await User.updateOne(
        { _id: rider._id },
        { $set: { expoPushToken: 'ExponentPushToken[deliver]' } }
      );

      let sentBody = null;
      globalThis.fetch = async (url, opts) => {
        sentBody = JSON.parse(opts.body);
        return { ok: true, json: async () => ({ data: [{ status: 'ok', id: 'tk1' }] }) };
      };

      const result = await sendPushToUser({
        userId: rider._id,
        title: 'New collection assigned',
        body: 'Open PathCare Rider',
        data: { type: 'JOB_ASSIGNED' },
      });

      expect(result.sent).toBe(true);
      expect(sentBody[0].to).toBe('ExponentPushToken[deliver]');
      expect(sentBody[0].data.type).toBe('JOB_ASSIGNED');
    });

    it('is a no-op when the feature flag is off (§3.5)', async () => {
      process.env.FF_PUSH_NOTIFICATIONS = 'false';
      await User.updateOne(
        { _id: rider._id },
        { $set: { expoPushToken: 'ExponentPushToken[deliver]' } }
      );

      let called = false;
      globalThis.fetch = async () => {
        called = true;
        return { ok: true, json: async () => ({ data: [{ status: 'ok' }] }) };
      };

      const result = await sendPushToUser({ userId: rider._id, title: 'x' });

      expect(result.sent).toBe(false);
      expect(result.reason).toBe('feature_disabled');
      expect(called).toBe(false);
    });

    it('does nothing when the user has no registered device', async () => {
      const result = await sendPushToUser({ userId: rider._id, title: 'x' });
      expect(result.sent).toBe(false);
      expect(result.reason).toBe('no_registered_device');
    });

    it('clears a token Expo reports as DeviceNotRegistered', async () => {
      await User.updateOne(
        { _id: rider._id },
        { $set: { expoPushToken: 'ExponentPushToken[stale]' } }
      );

      globalThis.fetch = async () => ({
        ok: true,
        json: async () => ({
          data: [{ status: 'error', details: { error: 'DeviceNotRegistered' } }],
        }),
      });

      const result = await sendPushToUser({ userId: rider._id, title: 'x' });

      expect(result.sent).toBe(false);
      // Stop trying to reach an uninstalled app.
      const stored = await User.findById(rider._id).select('expoPushToken');
      expect(stored.expoPushToken).toBeNull();
    });

    it('fails soft when the push service is unreachable', async () => {
      await User.updateOne(
        { _id: rider._id },
        { $set: { expoPushToken: 'ExponentPushToken[x]' } }
      );

      globalThis.fetch = async () => {
        throw new Error('ENOTFOUND exp.host');
      };

      // Must resolve, not throw: a failed push cannot fail the dispatch.
      await expect(
        sendPushToUser({ userId: rider._id, title: 'x' })
      ).resolves.toMatchObject({ sent: false, reason: 'transport_error' });
    });
  });

  describe('PII', () => {
    it('redacts the push token from logs (CONTEXT §9.10)', async () => {
      const { redactPII } = await import('../../src/utils/logger.js');
      const out = redactPII({ expoPushToken: 'ExponentPushToken[secret]', phone: '9870000001' });

      expect(out.expoPushToken).toBe('[REDACTED]');
      expect(out.phone).toBe('[REDACTED]');
    });
  });
});
