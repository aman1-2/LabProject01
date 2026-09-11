import test from 'node:test';
import assert from 'node:assert';
import { createOfflineQueue, RESULT } from './queue.js';

/**
 * The offline queue drains in order on reconnect.
 *
 * The failure this guards against is not "a write was lost" — it is "the writes
 * arrived shuffled". The server enforces a status state machine (§5.2), so a
 * `submitted` replayed ahead of its `collect` is rejected as an invalid
 * transition, and the sample silently never reaches the lab.
 */

/** AsyncStorage-shaped in-memory adapter. */
function memoryStorage(initial = {}) {
  const data = { ...initial };
  return {
    data,
    async getItem(key) {
      return key in data ? data[key] : null;
    },
    async setItem(key, value) {
      data[key] = value;
    },
  };
}

function apiError({ code = 'UNKNOWN_ERROR', status, isNetworkError = false } = {}) {
  return { code, status, isNetworkError, message: code };
}

let counter = 0;
const deterministicId = () => `item-${++counter}`;

function buildQueue(send, storage = memoryStorage()) {
  return {
    storage,
    queue: createOfflineQueue({ storage, send, makeId: deterministicId }),
  };
}

test('drains queued writes in the order they were made', async () => {
  const delivered = [];
  const { queue } = buildQueue(async (item) => {
    delivered.push(item.kind);
  });

  await queue.enqueue({ kind: 'collect', bookingId: 'b1', payload: { temperature: 4.2 } });
  await queue.enqueue({ kind: 'cash', bookingId: 'b1', payload: {} });
  await queue.enqueue({ kind: 'submitted', bookingId: 'b1', payload: { temperature: 5.1 } });

  const results = await queue.drain();

  assert.deepStrictEqual(delivered, ['collect', 'cash', 'submitted']);
  assert.deepStrictEqual(results.map((r) => r.outcome), [RESULT.SENT, RESULT.SENT, RESULT.SENT]);
  assert.strictEqual(await queue.size(), 0);
});

test('stops at the first unreachable write instead of skipping ahead', async () => {
  const delivered = [];
  const { queue } = buildQueue(async (item) => {
    if (item.kind === 'cash') throw apiError({ isNetworkError: true, code: 'NETWORK_ERROR' });
    delivered.push(item.kind);
  });

  await queue.enqueue({ kind: 'collect', bookingId: 'b1' });
  await queue.enqueue({ kind: 'cash', bookingId: 'b1' });
  await queue.enqueue({ kind: 'submitted', bookingId: 'b1' });

  const results = await queue.drain();

  // 'submitted' must NOT have gone out ahead of the cash confirmation.
  assert.deepStrictEqual(delivered, ['collect']);
  assert.strictEqual(results.at(-1).outcome, RESULT.DEFERRED);
  assert.strictEqual(await queue.size(), 2);

  const remaining = await queue.list();
  assert.deepStrictEqual(remaining.map((i) => i.kind), ['cash', 'submitted']);
  assert.strictEqual(remaining[0].attempts, 1);
});

test('resumes from the head and completes the order on reconnect', async () => {
  const delivered = [];
  let online = false;
  const { queue } = buildQueue(async (item) => {
    if (!online) throw apiError({ isNetworkError: true, code: 'NETWORK_ERROR' });
    delivered.push(item.kind);
  });

  await queue.enqueue({ kind: 'collect', bookingId: 'b1' });
  await queue.enqueue({ kind: 'cash', bookingId: 'b1' });
  await queue.enqueue({ kind: 'submitted', bookingId: 'b1' });

  await queue.drain();
  assert.deepStrictEqual(delivered, []);
  assert.strictEqual(await queue.size(), 3);

  online = true;
  await queue.drain();

  assert.deepStrictEqual(delivered, ['collect', 'cash', 'submitted']);
  assert.strictEqual(await queue.size(), 0);
});

test('survives an app restart: the outbox is read back from storage', async () => {
  const storage = memoryStorage();
  const first = createOfflineQueue({ storage, send: async () => {}, makeId: deterministicId });

  await first.enqueue({ kind: 'collect', bookingId: 'b1', payload: { temperature: 4.4 } });
  await first.enqueue({ kind: 'submitted', bookingId: 'b1' });

  // New process, same device storage.
  const delivered = [];
  const second = createOfflineQueue({
    storage,
    send: async (item) => delivered.push(item),
    makeId: deterministicId,
  });

  await second.drain();

  assert.deepStrictEqual(delivered.map((i) => i.kind), ['collect', 'submitted']);
  assert.strictEqual(delivered[0].payload.temperature, 4.4);
});

test('treats a duplicate cash confirmation as already applied, not a failure', async () => {
  // The original request landed; only the response was lost. Replaying it must
  // not surface as an error, or the rider is told the payment failed and asks
  // the patient for the money a second time.
  const { queue } = buildQueue(async (item) => {
    if (item.kind === 'cash') throw apiError({ code: 'ALREADY_CONFIRMED', status: 400 });
  });

  await queue.enqueue({ kind: 'cash', bookingId: 'b1' });
  await queue.enqueue({ kind: 'submitted', bookingId: 'b1' });

  const results = await queue.drain();

  assert.strictEqual(results[0].outcome, RESULT.ALREADY_APPLIED);
  // And it does not block what follows it.
  assert.strictEqual(results[1].outcome, RESULT.SENT);
  assert.strictEqual(await queue.size(), 0);
});

test('treats a duplicate collection the same way', async () => {
  const { queue } = buildQueue(async () => {
    throw apiError({ code: 'SAMPLE_ALREADY_COLLECTED', status: 400 });
  });

  await queue.enqueue({ kind: 'collect', bookingId: 'b1' });
  const results = await queue.drain();

  assert.strictEqual(results[0].outcome, RESULT.ALREADY_APPLIED);
  assert.strictEqual(await queue.size(), 0);
});

test('drops a permanently rejected write rather than blocking the queue forever', async () => {
  const delivered = [];
  const { queue } = buildQueue(async (item) => {
    if (item.kind === 'collect') throw apiError({ code: 'INVALID_STATUS_TRANSITION', status: 400 });
    delivered.push(item.kind);
  });

  await queue.enqueue({ kind: 'collect', bookingId: 'b1' });
  await queue.enqueue({ kind: 'submitted', bookingId: 'b1' });

  const results = await queue.drain();

  assert.strictEqual(results[0].outcome, RESULT.REJECTED);
  assert.strictEqual(results[0].error.code, 'INVALID_STATUS_TRANSITION');
  assert.deepStrictEqual(delivered, ['submitted']);
  assert.strictEqual(await queue.size(), 0);
});

test('retries a 5xx but gives up before it blocks the queue permanently', async () => {
  let attempts = 0;
  const storage = memoryStorage();
  const queue = createOfflineQueue({
    storage,
    maxAttempts: 3,
    makeId: deterministicId,
    send: async () => {
      attempts += 1;
      throw apiError({ code: 'INTERNAL', status: 500 });
    },
  });

  await queue.enqueue({ kind: 'collect', bookingId: 'b1' });

  assert.strictEqual((await queue.drain())[0].outcome, RESULT.DEFERRED);
  assert.strictEqual((await queue.drain())[0].outcome, RESULT.DEFERRED);
  const final = await queue.drain();

  assert.strictEqual(final[0].outcome, RESULT.REJECTED);
  assert.strictEqual(attempts, 3);
  assert.strictEqual(await queue.size(), 0);
});

test('concurrent drains do not send the head item twice', async () => {
  // Reconnect events fire more than once — a NetInfo change and a foreground
  // event can land in the same tick.
  const delivered = [];
  const { queue } = buildQueue(async (item) => {
    await new Promise((resolve) => setTimeout(resolve, 5));
    delivered.push(item.kind);
  });

  await queue.enqueue({ kind: 'collect', bookingId: 'b1' });
  await queue.enqueue({ kind: 'submitted', bookingId: 'b1' });

  await Promise.all([queue.drain(), queue.drain(), queue.drain()]);

  assert.deepStrictEqual(delivered, ['collect', 'submitted']);
});

test('an unreadable outbox starts empty rather than crashing the app', async () => {
  const storage = memoryStorage({ 'pathcare.rider.outbox.v1': '{not json' });
  const queue = createOfflineQueue({ storage, send: async () => {}, makeId: deterministicId });

  assert.deepStrictEqual(await queue.list(), []);
  await queue.enqueue({ kind: 'collect', bookingId: 'b1' });
  assert.strictEqual(await queue.size(), 1);
});
