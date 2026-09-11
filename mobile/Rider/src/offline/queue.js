/**
 * Durable, strictly-ordered outbox for collection status writes.
 *
 * A phlebotomist works in stairwells, basements and lifts. A write that fails
 * because the radio dropped must not be lost, and must not be replayed out of
 * order: `collect` before `cash-received` before `submitted` is a state machine
 * on the server (§5.2), and replaying them shuffled produces
 * INVALID_STATUS_TRANSITION for writes that were perfectly valid when made.
 *
 * What is deliberately NOT queued:
 *  - accepting a job. Claiming work you cannot confirm you hold is a dispatch
 *    failure with a person waiting at a door. Accept requires connectivity.
 *  - location pings. A stale position is worse than no position.
 *
 * Storage is injected so this file is testable without a device. The queue
 * holds booking ids and cold-chain readings — no credentials — so AsyncStorage
 * is the correct home for it (CONTEXT §7.3 restricts SecureStore to credentials).
 */

export const QUEUE_STORAGE_KEY = 'pathcare.rider.outbox.v1';

/**
 * Server codes that mean "this write already landed".
 *
 * A queued write can be replayed after the original silently succeeded — the
 * response was lost, not the request. The server rejects the duplicate, and
 * that rejection is the CORRECT outcome, not an error to show the rider. Cash
 * confirmation is the one that matters: treating ALREADY_CONFIRMED as a failure
 * would leave a paid booking looking unpaid in the app and invite the rider to
 * ask for the money twice.
 */
export const IDEMPOTENT_SUCCESS_CODES = new Set([
  'ALREADY_CONFIRMED',
  'SAMPLE_ALREADY_COLLECTED',
]);

/** Outcome of attempting one item. */
export const RESULT = {
  SENT: 'sent',
  ALREADY_APPLIED: 'already_applied',
  /** Permanently rejected — dropping it is the only correct move. */
  REJECTED: 'rejected',
  /** Could not reach the server — keep it, stop draining, try again later. */
  DEFERRED: 'deferred',
};

function isRetryable(error) {
  // No response at all means the request may never have been seen.
  if (error?.isNetworkError) return true;
  // 5xx and 429 are the server asking us to come back.
  if (error?.status >= 500) return true;
  if (error?.status === 429) return true;
  return false;
}

export function createOfflineQueue({
  storage,
  send,
  storageKey = QUEUE_STORAGE_KEY,
  onChange = null,
  maxAttempts = 8,
  now = () => Date.now(),
  makeId = () => `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`,
} = {}) {
  if (!storage) throw new Error('createOfflineQueue requires a storage adapter');
  if (typeof send !== 'function') throw new Error('createOfflineQueue requires a send function');

  /** Serialises drains. Two concurrent drains would send the head item twice. */
  let draining = null;

  async function read() {
    try {
      const raw = await storage.getItem(storageKey);
      const parsed = raw ? JSON.parse(raw) : [];
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      // A corrupt outbox must not brick the app on launch. Losing the queue is
      // bad; refusing to start is worse, and the server remains the source of
      // truth for what actually happened.
      return [];
    }
  }

  async function write(items) {
    await storage.setItem(storageKey, JSON.stringify(items));
    if (onChange) onChange(items);
  }

  /** Appends to the tail. Order of enqueue is order of send, always. */
  async function enqueue({ kind, bookingId, payload = {}, label = null }) {
    const items = await read();
    const item = {
      id: makeId(),
      kind,
      bookingId,
      payload,
      label,
      createdAt: now(),
      attempts: 0,
    };
    items.push(item);
    await write(items);
    return item;
  }

  async function list() {
    return read();
  }

  async function size() {
    return (await read()).length;
  }

  async function clear() {
    await write([]);
  }

  /**
   * Sends from the head until the queue is empty or one item cannot be
   * delivered. Stopping on the first deferral is the whole point: skipping past
   * a stuck item to send a later one is exactly the reordering this queue
   * exists to prevent.
   */
  async function drain() {
    if (draining) return draining;

    draining = (async () => {
      const results = [];

      for (;;) {
        const items = await read();
        if (items.length === 0) break;

        const head = items[0];
        let outcome;

        try {
          await send(head);
          outcome = RESULT.SENT;
        } catch (error) {
          if (IDEMPOTENT_SUCCESS_CODES.has(error?.code)) {
            outcome = RESULT.ALREADY_APPLIED;
          } else if (isRetryable(error) && head.attempts + 1 < maxAttempts) {
            outcome = RESULT.DEFERRED;
          } else if (isRetryable(error)) {
            // Out of attempts. Keeping it forever blocks every later write.
            outcome = RESULT.REJECTED;
          } else {
            outcome = RESULT.REJECTED;
          }

          if (outcome === RESULT.DEFERRED) {
            const current = await read();
            if (current[0]?.id === head.id) {
              current[0] = { ...head, attempts: head.attempts + 1, lastError: error?.code || 'UNKNOWN' };
              await write(current);
            }
            results.push({ item: head, outcome, error });
            break;
          }

          results.push({ item: head, outcome, error });
          const remaining = await read();
          await write(remaining.filter((entry) => entry.id !== head.id));
          continue;
        }

        results.push({ item: head, outcome });
        const remaining = await read();
        await write(remaining.filter((entry) => entry.id !== head.id));
      }

      return results;
    })();

    try {
      return await draining;
    } finally {
      draining = null;
    }
  }

  return { enqueue, drain, list, size, clear };
}

export default createOfflineQueue;
