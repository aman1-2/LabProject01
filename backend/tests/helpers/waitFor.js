/**
 * Poll until a condition holds, instead of sleeping a fixed interval.
 *
 * A fixed `setTimeout(150)` encodes an assumption about how fast the machine
 * is. It passes on an idle laptop and fails on a loaded one — and the failure
 * looks like a broken feature rather than a slow test, which is the worst kind
 * of flake because it sends you hunting a bug that is not there.
 *
 * Polling is also FASTER in the common case: it returns the moment the
 * condition holds rather than always burning the full interval.
 *
 * @param {Function} check   Returns a truthy value when the wait is over.
 *                           May be async. Throwing counts as "not yet".
 * @param {object}   options
 * @param {number}   options.timeoutMs  Ceiling before giving up.
 * @param {number}   options.intervalMs Gap between attempts.
 * @param {string}   options.describe   Included in the timeout message.
 */
export async function waitFor(
  check,
  { timeoutMs = 15000, intervalMs = 25, describe = 'condition' } = {}
) {
  const deadline = Date.now() + timeoutMs;
  let lastError = null;

  for (;;) {
    try {
      const result = await check();
      if (result) return result;
    } catch (error) {
      // A check that throws has simply not come true yet — a document that is
      // not there, a field still undefined. Only the final failure is reported.
      lastError = error;
    }

    if (Date.now() >= deadline) {
      const suffix = lastError ? ` Last error: ${lastError.message}` : '';
      throw new Error(`Timed out after ${timeoutMs}ms waiting for ${describe}.${suffix}`);
    }

    await new Promise((resolve) => setTimeout(resolve, intervalMs));
  }
}

/**
 * Waits for an array to reach a given length — the shape socket tests need,
 * where events accumulate in a buffer as they arrive.
 */
export async function waitForCount(getArray, count, options = {}) {
  await waitFor(() => getArray().length >= count, {
    describe: `${count} event(s), saw ${getArray().length}`,
    ...options,
  });
  return getArray();
}

/**
 * Resolves on the next `event` from a socket.io client, or rejects with a
 * useful message.
 *
 * `new Promise((res) => client.once('connect', res))` never rejects, so a
 * socket that fails to connect hangs the test until Jest's global timeout and
 * reports "Exceeded timeout of 30000 ms" against the whole test — pointing at
 * the assertion rather than the connection that never happened.
 */
export function onceWithTimeout(emitter, event, { timeoutMs = 15000 } = {}) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      cleanup();
      reject(new Error(`Timed out after ${timeoutMs}ms waiting for socket event "${event}".`));
    }, timeoutMs);

    /**
     * A rejected socket.io connection emits `connect_error`, never `connect`.
     * Waiting only for `connect` therefore reports a refused handshake — a bad
     * token, a failed auth lookup — as a timeout, which sends you looking for
     * slowness when the server actively said no. Listening for both turns that
     * into the server's own reason.
     */
    function onError(error) {
      if (event !== 'connect') return;
      cleanup();
      reject(new Error(`Socket connection refused: ${error?.message ?? error}`));
    }

    function onEvent(payload) {
      cleanup();
      resolve(payload);
    }

    function cleanup() {
      clearTimeout(timer);
      emitter.off?.(event, onEvent);
      emitter.off?.('connect_error', onError);
    }

    emitter.once(event, onEvent);
    if (event === 'connect') {
      emitter.once('connect_error', onError);
    }
  });
}

export default waitFor;
