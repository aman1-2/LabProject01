/**
 * Decides which Redis the test suite talks to.
 *
 * Background: every suite used `redis://localhost:6379` — database 0 — and Jest
 * runs suites in parallel. Rate-limit counters and the rider geo index are
 * global keys, so parallel suites overwrote each other. This was invisible for
 * as long as no Redis was running: every call fell through to the in-memory
 * fallback, which is per-process and therefore isolated by accident. The moment
 * a real Redis appeared, 28 tests started failing.
 *
 * Two modes:
 *
 * DEFAULT — point at a port nothing listens on, so every suite uses the
 *   in-memory fallback. Per-process, fully isolated, deterministic. This is the
 *   behaviour the suite was always written against.
 *
 * TEST_WITH_REDIS=1 — talk to a real Redis, one database per Jest worker.
 *   Exercises the genuine Redis and BullMQ paths, which the default cannot.
 *   Known to be flaky today: suites still contend on shared counters and the
 *   run fails roughly half the time. Use it to work on that, not in CI.
 */
/**
 * Make it impossible for a test to reach a real database.
 *
 * `connectDB(uri = process.env.MONGODB_URI)` falls back to the environment, and
 * integration suites call `deleteMany({})` in beforeEach. Before this repo had
 * a backend/.env there was nothing to fall back TO, so the hazard was
 * theoretical. The moment a developer creates one pointing at a local mongod,
 * a single `connectDB()` with no argument wipes their database — and the test
 * still passes, so nothing tells them.
 *
 * Suites pass an explicit mongodb-memory-server URI; this only removes the
 * dangerous default. `MONGODB_URI` is restored per-suite by nothing, because
 * nothing should want it.
 */
if (process.env.MONGODB_URI) {
  process.env.MONGODB_URI_REAL_IGNORED_IN_TESTS = process.env.MONGODB_URI;
  delete process.env.MONGODB_URI;
}

const USE_REAL_REDIS = process.env.TEST_WITH_REDIS === '1';
const MAX_REDIS_DB = 15;

if (!USE_REAL_REDIS) {
  // Nothing listens on port 1; the client fails fast to the in-memory store.
  process.env.REDIS_URL = 'redis://127.0.0.1:1';
  process.env.REDIS_MAX_RETRY_DELAY_MS = '0';
} else {
  const workerId = Number(process.env.JEST_WORKER_ID || 1);
  const host = process.env.REDIS_TEST_HOST || '127.0.0.1';
  const port = process.env.REDIS_TEST_PORT || '6379';

  // Redis ships 16 databases (0-15); worker ids start at 1. Beyond that they
  // would wrap and share again, so fall back rather than pretend to isolate.
  process.env.REDIS_URL =
    workerId <= MAX_REDIS_DB ? `redis://${host}:${port}/${workerId}` : 'redis://127.0.0.1:1';
}
