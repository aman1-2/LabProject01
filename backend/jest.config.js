export default {
  testEnvironment: 'node',
  transform: {},
  verbose: true,
  testTimeout: 60000,
  /**
   * Integration suites are heavyweight: each one starts its own
   * `mongodb-memory-server` mongod alongside the Jest worker's own heap. Jest's
   * default (cores - 1, so 7 here) oversubscribes a machine with 8 GB of RAM —
   * mongod startups then contend, suites cross the 30s timeout, and the run
   * fails with a DIFFERENT set of suites each time. Every one of them passes in
   * isolation, which is the signature of resource exhaustion rather than a bug.
   *
   * Capping workers trades wall-clock time for a deterministic result. Override
   * with `--maxWorkers` on a larger machine.
   */
  maxWorkers: Number(process.env.JEST_MAX_WORKERS) || 2,
  /** Restart a worker that has grown past this, rather than letting it swap. */
  workerIdleMemoryLimit: '512MB',
  /**
   * Runs before the test framework loads, so REDIS_URL is already per-worker by
   * the time any module reads it at import time.
   */
  setupFiles: ['<rootDir>/tests/setupRedisIsolation.js'],
  /** Runs after the framework is available, so it can register beforeAll/afterAll. */
  setupFilesAfterEnv: ['<rootDir>/tests/setupIntegrationRuntime.js'],
};
