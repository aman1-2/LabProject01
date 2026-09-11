import request from 'supertest';
import mongoose from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';
import createApp from '../../src/app.js';
import { resetRateLimitStore } from '../../src/middlewares/rateLimiter.js';
import { connectDB, disconnectDB } from '../../src/config/dbConfig.js';
import User from '../../src/schemas/User.js';

describe('Auth API Integration Tests', () => {
  /**
   * The refresh token is delivered ONLY as an httpOnly cookie (HIGH H17); it is
   * deliberately absent from the JSON body. Tests read it from Set-Cookie.
   */
  function refreshTokenFromCookie(res) {
    const cookies = res.headers['set-cookie'] || [];
    const cookie = cookies.find((c) => c.startsWith('refreshToken='));
    if (!cookie) return null;
    return decodeURIComponent(cookie.split(';')[0].split('=')[1]);
  }

  let mongoServer;
  let app;

  beforeAll(async () => {
    try {
      mongoServer = await MongoMemoryServer.create({ instance: { dbName: 'pathcare_test' } });
      const uri = mongoServer.getUri();
      await connectDB(uri);
    } catch {
      // Fallback to local MongoDB if MongoMemoryServer download is blocked
      await connectDB(process.env.MONGODB_URI || 'mongodb://localhost:27017/pathcare_test');
    }

    app = createApp();
  });

  afterAll(async () => {
    await User.deleteMany({});
    await disconnectDB();
    if (mongoServer) {
      await mongoServer.stop();
    }
  });

  beforeEach(async () => {
    // Global + OTP rate limiting is real (HIGH H2); clear counters so the
    // suite is not throttled by its own volume from a single IP.
    await resetRateLimitStore();

    await User.deleteMany({});
  });

  const validSignupData = {
    accountHandle: 'aman_test',
    phone: '9876543210',
    name: 'Aman Pathak',
    password: 'securePassword123',
    accountType: 'single',
    location: {
      lat: 30.3165,
      lng: 78.0322,
      address: 'Rajpur Road, Dehradun',
      source: 'geo',
    },
  };

  // The OTP rate limiter keys on phone number and its store lives for the life of
  // the process, so a number shared across tests leaks its 5-per-hour budget into
  // later tests. Every test that sends an OTP uses its own number.
  const signupDataFor = (phone, accountHandle = validSignupData.accountHandle) => ({
    ...validSignupData,
    phone,
    accountHandle,
  });

  it('Flow: full signup -> OTP verification -> DB creation -> password & OTP login', async () => {
    // 1. Check handle availability
    const handleRes = await request(app)
      .post('/api/v1/auth/handle-available')
      .send({ handle: 'aman_test' });
    expect(handleRes.status).toBe(200);
    expect(handleRes.body.available).toBe(true);

    // 2. Initiate signup
    const signupRes = await request(app)
      .post('/api/v1/auth/signup')
      .send(validSignupData);

    expect(signupRes.status).toBe(200);
    expect(signupRes.body.otpToken).toBeDefined();
    expect(signupRes.body.expiresIn).toBe(60);

    // Confirm user is NOT created in DB yet
    const preUser = await User.findOne({ accountHandle: 'aman_test' });
    expect(preUser).toBeNull();

    // 3. Verify OTP and create user
    const { otpToken, debugOtp } = signupRes.body;
    expect(debugOtp).toBeDefined();

    const verifyRes = await request(app)
      .post('/api/v1/auth/verify-otp')
      .send({ otpToken, otp: debugOtp });

    expect(verifyRes.status).toBe(201);
    expect(verifyRes.body.success).toBe(true);
    expect(verifyRes.body.token).toBeDefined();
    // Delivered as an httpOnly cookie, never in the body.
    expect(verifyRes.body.refreshToken).toBeUndefined();
    expect(refreshTokenFromCookie(verifyRes)).toBeTruthy();
    expect(verifyRes.body.user.accountHandle).toBe('aman_test');
    expect(verifyRes.body.user.passwordHash).toBeUndefined(); // PII redacted

    // Confirm user IS now created in DB
    const postUser = await User.findOne({ accountHandle: 'aman_test' });
    expect(postUser).not.toBeNull();
    expect(postUser.name).toBe('Aman Pathak');
    expect(postUser.role).toBe('patient');

    // 4. Login with accountHandle + password
    const loginRes = await request(app)
      .post('/api/v1/auth/login')
      .send({
        accountHandle: 'aman_test',
        password: 'securePassword123',
      });

    expect(loginRes.status).toBe(200);
    expect(loginRes.body.token).toBeDefined();
    expect(loginRes.body.user.accountHandle).toBe('aman_test');

    // 5. Login with mobile + OTP
    const loginOtpRes = await request(app)
      .post('/api/v1/auth/login/otp')
      .send({ phone: '9876543210' });

    expect(loginOtpRes.status).toBe(200);
    const loginToken = loginOtpRes.body.otpToken;
    const loginOtp = loginOtpRes.body.debugOtp;

    const verifyLoginRes = await request(app)
      .post('/api/v1/auth/login/verify-otp')
      .send({ otpToken: loginToken, otp: loginOtp });

    expect(verifyLoginRes.status).toBe(200);
    expect(verifyLoginRes.body.token).toBeDefined();
    expect(verifyLoginRes.body.user.accountHandle).toBe('aman_test');
  });

  it('Rejection: duplicate handle and duplicate phone are rejected with 409', async () => {
    const base = signupDataFor('9876543211');

    // First, register a user
    const s1 = await request(app).post('/api/v1/auth/signup').send(base);
    await request(app).post('/api/v1/auth/verify-otp').send({
      otpToken: s1.body.otpToken,
      otp: s1.body.debugOtp,
    });

    // Try signup with duplicate handle but different phone
    const dupHandleRes = await request(app)
      .post('/api/v1/auth/signup')
      .send({
        ...base,
        phone: '9876543299',
      });

    expect(dupHandleRes.status).toBe(409);
    expect(dupHandleRes.body.error.code).toBe('DUPLICATE_KEY_ERROR');

    // Try signup with duplicate phone but different handle
    const dupPhoneRes = await request(app)
      .post('/api/v1/auth/signup')
      .send({
        ...base,
        accountHandle: 'another_handle',
      });

    expect(dupPhoneRes.status).toBe(409);
    expect(dupPhoneRes.body.error.code).toBe('DUPLICATE_KEY_ERROR');
  });

  it('Rate limit: 6th OTP request for the same mobile in an hour returns 429', async () => {
    const testPhone = '9876500000';

    for (let i = 1; i <= 5; i++) {
      const res = await request(app).post('/api/v1/auth/signup').send({
        ...validSignupData,
        accountHandle: `user_limit_${i}`,
        phone: testPhone,
      });
      expect(res.status).toBe(200);
    }

    // 6th attempt must be rejected
    const sixthRes = await request(app).post('/api/v1/auth/signup').send({
      ...validSignupData,
      accountHandle: 'user_limit_6',
      phone: testPhone,
    });

    expect(sixthRes.status).toBe(429);
    expect(sixthRes.body.error.code).toBe('RATE_LIMIT_EXCEEDED');
  });

  it('Rejection: expired or invalid OTP is rejected with 400', async () => {
    const signupRes = await request(app)
      .post('/api/v1/auth/signup')
      .send(signupDataFor('9876543213'));

    const { otpToken } = signupRes.body;

    // Wrong OTP
    const wrongRes = await request(app)
      .post('/api/v1/auth/verify-otp')
      .send({ otpToken, otp: '000000' });

    expect(wrongRes.status).toBe(400);
    expect(wrongRes.body.error.code).toBe('INVALID_OTP');

    // Invalid / unknown token
    const invalidTokenRes = await request(app)
      .post('/api/v1/auth/verify-otp')
      .send({ otpToken: 'non-existent-token', otp: '123456' });

    expect(invalidTokenRes.status).toBe(400);
    expect(invalidTokenRes.body.error.code).toBe('OTP_EXPIRED');
  });

  it('Security: refresh token rotation invalidates old refresh token immediately', async () => {
    // Signup and get tokens
    const s = await request(app).post('/api/v1/auth/signup').send(signupDataFor('9876543214'));
    const authRes = await request(app).post('/api/v1/auth/verify-otp').send({
      otpToken: s.body.otpToken,
      otp: s.body.debugOtp,
    });

    const originalRefreshToken = refreshTokenFromCookie(authRes);
    expect(originalRefreshToken).toBeTruthy();

    // Rotate refresh token
    const refreshRes1 = await request(app)
      .post('/api/v1/auth/refresh')
      .send({ refreshToken: originalRefreshToken });

    expect(refreshRes1.status).toBe(200);
    expect(refreshRes1.body.token).toBeDefined();
    expect(refreshRes1.body.refreshToken).toBeUndefined();

    const rotatedRefreshToken = refreshTokenFromCookie(refreshRes1);
    expect(rotatedRefreshToken).toBeTruthy();
    expect(rotatedRefreshToken).not.toBe(originalRefreshToken);

    // Attempting to reuse the old refresh token must be rejected
    const reuseRes = await request(app)
      .post('/api/v1/auth/refresh')
      .send({ refreshToken: originalRefreshToken });

    expect(reuseRes.status).toBe(401);
    expect(reuseRes.body.error.code).toBe('INVALID_REFRESH_TOKEN');
  });
  // -- HIGH H6 / H7 / H17 regression ------------------------------------------
  describe('HIGH H6/H7/H17 -- credential and PII leakage', () => {
    const ORIGINAL_NODE_ENV = process.env.NODE_ENV;

    afterEach(() => {
      process.env.NODE_ENV = ORIGINAL_NODE_ENV;
    });

    // H7: the echo gate was `NODE_ENV !== 'production'` -- fail OPEN. Any value
    // that was not exactly 'production' returned the OTP in the response body.
    it('H7: does NOT echo the OTP when NODE_ENV is unset', async () => {
      delete process.env.NODE_ENV;

      const res = await request(app)
        .post('/api/v1/auth/signup')
        .send(signupDataFor('9811100001', 'h6_user_one'));

      expect(res.status).toBe(200);
      expect(res.body.otpToken).toBeDefined();
      expect(res.body.debugOtp).toBeUndefined();
    });

    it('H7: does NOT echo the OTP when NODE_ENV is "staging"', async () => {
      process.env.NODE_ENV = 'staging';

      const res = await request(app)
        .post('/api/v1/auth/signup')
        .send(signupDataFor('9811100002', 'h6_user_two'));

      expect(res.status).toBe(200);
      expect(res.body.debugOtp).toBeUndefined();
    });

    it('H7: does NOT echo the OTP on login for an unset NODE_ENV', async () => {
      // Register a real account first (test env, so debugOtp is available).
      process.env.NODE_ENV = 'test';
      const s = await request(app)
        .post('/api/v1/auth/signup')
        .send(signupDataFor('9811100003', 'h6_user_three'));
      await request(app)
        .post('/api/v1/auth/verify-otp')
        .send({ otpToken: s.body.otpToken, otp: s.body.debugOtp });

      delete process.env.NODE_ENV;

      const res = await request(app)
        .post('/api/v1/auth/login/otp')
        .send({ phone: '9811100003' });

      expect(res.status).toBe(200);
      expect(res.body.debugOtp).toBeUndefined();
    });

    // H7: phone-enumeration oracle. A 404 for unknown numbers is what turns an
    // echoed OTP into account takeover for any known phone number.
    it('H7: an unregistered phone is indistinguishable from a registered one', async () => {
      process.env.NODE_ENV = 'test';
      const s = await request(app)
        .post('/api/v1/auth/signup')
        .send(signupDataFor('9811100004', 'h6_user_four'));
      await request(app)
        .post('/api/v1/auth/verify-otp')
        .send({ otpToken: s.body.otpToken, otp: s.body.debugOtp });

      const known = await request(app)
        .post('/api/v1/auth/login/otp')
        .send({ phone: '9811100004' });

      const unknown = await request(app)
        .post('/api/v1/auth/login/otp')
        .send({ phone: '9700000000' });

      // Previously: 200 vs 404 USER_NOT_FOUND.
      expect(unknown.status).toBe(known.status);
      expect(unknown.status).toBe(200);
      expect(typeof unknown.body.otpToken).toBe('string');
      expect(unknown.body.expiresIn).toBe(known.body.expiresIn);
    });

    it('H7: the token issued for an unknown phone never verifies', async () => {
      const res = await request(app)
        .post('/api/v1/auth/login/otp')
        .send({ phone: '9700000001' });

      const verify = await request(app)
        .post('/api/v1/auth/login/verify-otp')
        .send({ otpToken: res.body.otpToken, otp: '123456' });

      expect(verify.status).toBe(400);
      expect(verify.body.error.code).toBe('OTP_EXPIRED');
    });

    // H17: the refresh token was returned in the JSON body as well as the
    // httpOnly cookie, handing it to any script running on the page.
    it('H17: login does not return the refresh token in the body', async () => {
      process.env.NODE_ENV = 'test';
      const s = await request(app)
        .post('/api/v1/auth/signup')
        .send(signupDataFor('9811100005', 'h6_user_five'));
      await request(app)
        .post('/api/v1/auth/verify-otp')
        .send({ otpToken: s.body.otpToken, otp: s.body.debugOtp });

      const login = await request(app)
        .post('/api/v1/auth/login')
        .send({ accountHandle: 'h6_user_five', password: validSignupData.password });

      expect(login.status).toBe(200);
      expect(login.body.token).toBeDefined();
      // Previously present in the body alongside the cookie.
      expect(login.body.refreshToken).toBeUndefined();
      expect(refreshTokenFromCookie(login)).toBeTruthy();
    });
  });
});
