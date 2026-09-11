import request from 'supertest';
import { MongoMemoryServer } from 'mongodb-memory-server';
import bcrypt from 'bcrypt';
import createApp from '../../src/app.js';
import { connectDB, disconnectDB } from '../../src/config/dbConfig.js';
import { User } from '../../src/schemas/User.js';
import { resetRateLimitStore } from '../../src/middlewares/rateLimiter.js';

/**
 * Refresh-token delivery to native clients.
 *
 * The refresh token is an httpOnly cookie so page script cannot read it. An
 * Expo app has no cookie jar we control and CONTEXT §7.3 requires tokens in
 * `expo-secure-store`, so a native client needs it in the body — but that echo
 * must not be reachable from a browser, or XSS could ask for it, let the
 * browser attach the cookie, and read the token out of the JSON.
 */
describe('Native client refresh-token delivery', () => {
  let mongoServer;
  let app;

  const HANDLE = 'native_rider';
  const PASSWORD = 'CorrectHorse9!';

  beforeAll(async () => {
    mongoServer = await MongoMemoryServer.create({ instance: { dbName: 'pathcare_native_test' } });
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
    await User.create({
      accountHandle: HANDLE,
      phone: '9860000001',
      name: 'Native Rider',
      passwordHash: await bcrypt.hash(PASSWORD, 10),
      role: 'rider',
      location: { lat: 30.31, lng: 78.03, address: 'Dehradun', source: 'manual' },
    });
  });

  const credentials = { accountHandle: HANDLE, password: PASSWORD };

  it('returns the refresh token in the body to a native client', async () => {
    const res = await request(app)
      .post('/api/auth/login')
      .set('X-Client-Type', 'mobile')
      .send(credentials);

    expect(res.status).toBe(200);
    expect(res.body.token).toEqual(expect.any(String));
    // Without this the Expo app can never hold a session.
    expect(res.body.refreshToken).toEqual(expect.any(String));
  });

  it('still withholds it from an ordinary browser request', async () => {
    const res = await request(app).post('/api/auth/login').send(credentials);

    expect(res.status).toBe(200);
    expect(res.body.refreshToken).toBeUndefined();
    expect(res.headers['set-cookie'].join(';')).toContain('refreshToken=');
  });

  it.each([
    ['Origin', 'https://pathcare.example'],
    ['Referer', 'https://pathcare.example/dashboard'],
    ['Sec-Fetch-Mode', 'cors'],
    ['Sec-Fetch-Site', 'same-origin'],
    ['Sec-Fetch-Dest', 'empty'],
  ])(
    'withholds it when the spoofed header arrives alongside browser-set %s (XSS path)',
    async (header, value) => {
      const res = await request(app)
        .post('/api/auth/login')
        .set('X-Client-Type', 'mobile')
        .set(header, value)
        .send(credentials);

      expect(res.status).toBe(200);
      // The browser adds this header itself; page script cannot remove it, so
      // an XSS payload claiming to be the mobile app is caught here.
      expect(res.body.refreshToken).toBeUndefined();
    }
  );

  it('lets a native client rotate using the body token, with no cookie at all', async () => {
    const login = await request(app)
      .post('/api/auth/login')
      .set('X-Client-Type', 'mobile')
      .send(credentials);

    const refreshed = await request(app)
      .post('/api/auth/refresh')
      .set('X-Client-Type', 'mobile')
      .send({ refreshToken: login.body.refreshToken });

    expect(refreshed.status).toBe(200);
    expect(refreshed.body.token).toEqual(expect.any(String));
    // Rotation must hand back the NEW refresh token, or the app is logged out
    // the moment the old one is invalidated.
    expect(refreshed.body.refreshToken).toEqual(expect.any(String));
    expect(refreshed.body.refreshToken).not.toBe(login.body.refreshToken);
  });

  it('rejects a rotated-away refresh token', async () => {
    const login = await request(app)
      .post('/api/auth/login')
      .set('X-Client-Type', 'mobile')
      .send(credentials);

    await request(app)
      .post('/api/auth/refresh')
      .set('X-Client-Type', 'mobile')
      .send({ refreshToken: login.body.refreshToken });

    const replay = await request(app)
      .post('/api/auth/refresh')
      .set('X-Client-Type', 'mobile')
      .send({ refreshToken: login.body.refreshToken });

    expect(replay.status).toBe(401);
  });
});
