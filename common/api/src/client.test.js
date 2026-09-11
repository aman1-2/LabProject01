import test from 'node:test';
import assert from 'node:assert';
import { createApiClient, createQueryClient, configureApi, resetApiConfig } from './index.js';

/**
 * Transport tests.
 *
 * The request interceptor used to be an empty function with a comment reading
 * "Authorization token injection placeholder", so every authenticated call went
 * out with no Authorization header. These pin the behaviour that replaced it.
 */

/** Installs a fake transport and records what the client actually sent. */
function stubAdapter(client, handler) {
  const sent = [];
  client.defaults.adapter = async (config) => {
    // Snapshot the headers: axios reuses the same config object across a retry,
    // so holding the live reference would make every recorded attempt look
    // identical to the last one.
    sent.push({ url: config.url, method: config.method, baseURL: config.baseURL, headers: { ...config.headers } });
    const result = await handler(config, sent.length);

    if (result.status >= 200 && result.status < 300) {
      return { data: result.data ?? {}, status: result.status, statusText: 'OK', headers: {}, config };
    }

    const error = new Error(`Request failed with status code ${result.status}`);
    error.config = config;
    error.response = { data: result.data ?? {}, status: result.status, headers: {}, config };
    throw error;
  };
  return sent;
}

test('api client and query client initialize properly', () => {
  const client = createApiClient('http://localhost:5000');
  assert.ok(client.get);
  assert.strictEqual(client.defaults.baseURL, 'http://localhost:5000');

  const qc = createQueryClient();
  assert.ok(qc.getQueryCache);
});

test('attaches the access token from the configured provider', async (t) => {
  t.after(resetApiConfig);
  configureApi({
    baseUrl: 'http://api.test',
    getAccessToken: async () => 'access-abc',
    headers: { 'X-Client-Type': 'mobile' },
  });

  const client = createApiClient();
  const sent = stubAdapter(client, () => ({ status: 200, data: { ok: true } }));

  await client.get('/api/rider/jobs');

  assert.strictEqual(sent[0].headers.Authorization, 'Bearer access-abc');
  assert.strictEqual(sent[0].headers['X-Client-Type'], 'mobile');
  assert.strictEqual(sent[0].baseURL, 'http://api.test');
});

test('sends no Authorization header when there is no session', async (t) => {
  t.after(resetApiConfig);
  configureApi({ baseUrl: 'http://api.test', getAccessToken: async () => null });

  const client = createApiClient();
  const sent = stubAdapter(client, () => ({ status: 200 }));

  await client.get('/api/tests');

  assert.strictEqual(sent[0].headers.Authorization, undefined);
});

test('skipAuth requests carry no token and are never refreshed', async (t) => {
  t.after(resetApiConfig);
  let refreshCalls = 0;
  configureApi({
    baseUrl: 'http://api.test',
    getAccessToken: async () => 'stale',
    refreshAccessToken: async () => {
      refreshCalls += 1;
      return 'fresh';
    },
  });

  const client = createApiClient();
  const sent = stubAdapter(client, () => ({ status: 401, data: { error: { code: 'INVALID_CREDENTIALS' } } }));

  await assert.rejects(
    () => client.post('/api/auth/login', {}, { skipAuth: true }),
    (err) => err.code === 'INVALID_CREDENTIALS'
  );

  assert.strictEqual(sent[0].headers.Authorization, undefined);
  // A bad password must not trigger a refresh loop.
  assert.strictEqual(refreshCalls, 0);
  assert.strictEqual(sent.length, 1);
});

test('refreshes once on 401 and replays the original request', async (t) => {
  t.after(resetApiConfig);
  let token = 'expired';
  configureApi({
    baseUrl: 'http://api.test',
    getAccessToken: async () => token,
    refreshAccessToken: async () => {
      token = 'renewed';
      return token;
    },
  });

  const client = createApiClient();
  const sent = stubAdapter(client, (config, callNumber) =>
    callNumber === 1 ? { status: 401, data: { error: { code: 'TOKEN_EXPIRED' } } } : { status: 200, data: { data: { jobs: [] } } }
  );

  const response = await client.get('/api/rider/jobs');

  assert.strictEqual(response.status, 200);
  assert.strictEqual(sent.length, 2);
  assert.strictEqual(sent[0].headers.Authorization, 'Bearer expired');
  assert.strictEqual(sent[1].headers.Authorization, 'Bearer renewed');
});

test('de-duplicates concurrent refreshes into one rotation', async (t) => {
  t.after(resetApiConfig);
  // The refresh token rotates on use: a second concurrent rotation would be
  // rejected as a replay and log the rider out mid-job.
  let refreshCalls = 0;
  configureApi({
    baseUrl: 'http://api.test',
    getAccessToken: async () => 'expired',
    refreshAccessToken: async () => {
      refreshCalls += 1;
      await new Promise((resolve) => setTimeout(resolve, 10));
      return 'renewed';
    },
  });

  const client = createApiClient();
  const seen = new Set();
  stubAdapter(client, (config) => {
    if (config.headers.Authorization === 'Bearer renewed') {
      return { status: 200, data: { ok: true } };
    }
    seen.add(config.url);
    return { status: 401, data: { error: { code: 'TOKEN_EXPIRED' } } };
  });

  const results = await Promise.all([
    client.get('/api/rider/jobs'),
    client.get('/api/users/me'),
    client.get('/api/bookings'),
  ]);

  assert.strictEqual(refreshCalls, 1);
  assert.deepStrictEqual(results.map((r) => r.status), [200, 200, 200]);
});

test('gives up and reports session expiry when refresh fails', async (t) => {
  t.after(resetApiConfig);
  let expiredCalls = 0;
  configureApi({
    baseUrl: 'http://api.test',
    getAccessToken: async () => 'expired',
    refreshAccessToken: async () => null,
    onSessionExpired: async () => {
      expiredCalls += 1;
    },
  });

  const client = createApiClient();
  const sent = stubAdapter(client, () => ({ status: 401, data: { error: { code: 'TOKEN_EXPIRED', message: 'Session ended' } } }));

  await assert.rejects(
    () => client.get('/api/rider/jobs'),
    (err) => err.status === 401 && err.message === 'Session ended'
  );

  assert.strictEqual(expiredCalls, 1);
  // One attempt, one refresh attempt, no retry — never an infinite loop.
  assert.strictEqual(sent.length, 1);
});

test('normalises the server error envelope', async (t) => {
  t.after(resetApiConfig);
  configureApi({ baseUrl: 'http://api.test' });

  const client = createApiClient();
  stubAdapter(client, () => ({
    status: 409,
    data: { error: { message: 'This job has already been taken by another phlebotomist', code: 'JOB_ALREADY_TAKEN' } },
  }));

  await assert.rejects(
    () => client.patch('/api/rider/jobs/abc/accept'),
    (err) => {
      assert.strictEqual(err.code, 'JOB_ALREADY_TAKEN');
      assert.strictEqual(err.status, 409);
      assert.strictEqual(err.isNetworkError, false);
      return true;
    }
  );
});

test('flags a transport failure as a network error so it can be queued', async (t) => {
  t.after(resetApiConfig);
  configureApi({ baseUrl: 'http://api.test' });

  const client = createApiClient();
  client.defaults.adapter = async () => {
    const error = new Error('Network Error');
    error.config = {};
    throw error;
  };

  await assert.rejects(
    () => client.post('/api/rider/jobs/abc/collect'),
    (err) => {
      // The offline queue keys off exactly this: no response means the write
      // may never have reached the server, so it is safe to retry later.
      assert.strictEqual(err.isNetworkError, true);
      assert.strictEqual(err.code, 'NETWORK_ERROR');
      assert.strictEqual(err.status, undefined);
      return true;
    }
  );
});
