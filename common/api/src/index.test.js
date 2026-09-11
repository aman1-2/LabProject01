import test from 'node:test';
import assert from 'node:assert';
import { createApiClient, createQueryClient } from './index.js';

test('api client and query client initialize properly', () => {
  const client = createApiClient('http://localhost:5000');
  assert.ok(client.get);
  assert.strictEqual(client.defaults.baseURL, 'http://localhost:5000');

  const qc = createQueryClient();
  assert.ok(qc.getQueryCache);
});
