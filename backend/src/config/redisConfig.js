import Redis from 'ioredis';
import logger from '../utils/logger.js';

let defaultClient = null;

/**
 * How long to keep trying before giving up permanently.
 *
 * This used to `return null` after three attempts, which tells ioredis to stop
 * reconnecting for the life of the process. A single Redis restart or failover
 * therefore left the API permanently degraded — rate limits silently falling
 * back to a per-process map, the rider geo index empty, and queued jobs never
 * consumed — with no error and no recovery short of a redeploy. It also made
 * the test suite flaky: a client that died mid-run split rate-limit counts
 * across two stores, so limits never tripped.
 *
 * Redis coming back is the normal case, so the client keeps retrying with
 * capped backoff. Set REDIS_MAX_RETRY_MS=0 for genuinely offline development,
 * where failing fast to the in-memory fallback is what you want.
 */
const MAX_RETRY_DELAY_MS = Number(process.env.REDIS_MAX_RETRY_DELAY_MS ?? 2000);

/**
 * Why there are two client shapes.
 *
 * Reconnecting forever (above) is right, but it was combined with
 * `maxRetriesPerRequest: null` and ioredis's offline queue on a single shared
 * client. Those two settings mean a command issued while Redis is down is
 * BUFFERED FOREVER rather than failing. Since `globalRateLimiter` awaits Redis
 * on every request, a Redis outage stopped being a degradation and became a
 * total API outage: the process listened, accepted connections, and answered
 * nothing.
 *
 * The request path must fail FAST so its callers can fall back to the
 * in-memory store — that fallback is the whole reason it exists. BullMQ is the
 * opposite: it documents `maxRetriesPerRequest: null` as required, because it
 * holds long-lived blocking reads.
 *
 * So: one shape for the request path, one for queues. Both keep retrying
 * forever, so a transient outage still heals on its own.
 */
const REQUEST_PATH_OPTIONS = {
  // Fail a command immediately when there is no connection instead of
  // buffering it until one appears.
  enableOfflineQueue: false,
  maxRetriesPerRequest: 1,
  connectTimeout: 2000,
  enableReadyCheck: false,
};

const QUEUE_OPTIONS = {
  // BullMQ requires this; its blocking commands must not be capped.
  maxRetriesPerRequest: null,
  enableOfflineQueue: true,
  enableReadyCheck: false,
};

/**
 * TCP keep-alive probe interval.
 *
 * ioredis defaults this to 0, which disables keep-alive entirely — and that is
 * how a client ends up wedged. When Redis dies without closing the socket
 * cleanly (a killed container, a dropped NAT mapping, a severed link), nothing
 * tells the client. `status` stays `'ready'` for the life of the process, so
 * ioredis never schedules a reconnect, while every command fails with "Stream
 * isn't writeable". The API then runs permanently on its fallbacks — auth
 * sessions in a Map, rate limits per-process — with Redis up and reachable the
 * whole time.
 *
 * With keep-alive on, the OS notices the dead peer, the socket closes, and the
 * ordinary reconnect path takes over.
 */
const KEEPALIVE_MS = Number(process.env.REDIS_KEEPALIVE_MS ?? 10000);

export function createRedisClient({ name = 'request', ...options } = {}) {
  const url = process.env.REDIS_URL || 'redis://localhost:6379';
  const client = new Redis(url, {
    keepAlive: KEEPALIVE_MS,
    ...REQUEST_PATH_OPTIONS,
    retryStrategy(times) {
      if (MAX_RETRY_DELAY_MS === 0) {
        return null; // opt-in fail-fast for offline development
      }
      // Exponential-ish backoff, capped. Never returns null: a transient
      // outage must not permanently disable Redis for this process.
      return Math.min(times * 100, MAX_RETRY_DELAY_MS);
    },
    ...options,
  });

  client.on('connect', () => {
    logger.info('Redis client connected', { client: name });
  });

  client.on('error', (err) => {
    logger.error('Redis error', { client: name, error: err.message });
  });

  // Connection lifecycle. Without these a reconnect storm is invisible in the
  // logs, and a client that stops reconnecting looks identical to one that is
  // simply idle.
  client.on('close', () => logger.warn('Redis connection closed', { client: name }));
  client.on('reconnecting', (delay) => logger.warn('Redis reconnecting', { client: name, delay }));
  client.on('end', () => logger.error('Redis connection ended; no further reconnects', { client: name }));

  return client;
}

/**
 * A long-lived pub/sub connection, for the Socket.IO adapter.
 *
 * Shares BullMQ's shape rather than the request path's, and for the same
 * reason: it is infrastructure, not a request. When the connection drops,
 * ioredis re-issues `SUBSCRIBE` for every channel as soon as it reconnects. On
 * a client built with `enableOfflineQueue: false` that command is thrown out
 * instead of buffered — and because it is raised inside ioredis's own reconnect
 * handler rather than a caller's promise chain, it lands as an unhandled
 * rejection and takes the process down.
 *
 * So a single Redis restart killed the API: not the degradation the two shapes
 * above were written to guarantee, but a crash loop.
 */
export function createPubSubClient(options = {}) {
  return createRedisClient({ ...QUEUE_OPTIONS, name: 'pubsub', ...options });
}

export function getRedisClient() {
  if (!defaultClient) {
    defaultClient = createRedisClient();
  }
  return defaultClient;
}

let queueClient = null;

/**
 * The connection BullMQ queues and workers use.
 *
 * Separate from the request-path client because BullMQ needs
 * `maxRetriesPerRequest: null` and a working offline queue, which are exactly
 * the settings that make a request hang when Redis is unavailable.
 */
export function getQueueConnection() {
  if (!queueClient) {
    queueClient = createRedisClient({ ...QUEUE_OPTIONS, name: 'queue' });
  }
  return queueClient;
}

/**
 * How long a health probe may wait for a connection to come up.
 *
 * Matched to the request-path `connectTimeout` so the probe never gives up
 * before the client itself would have.
 */
const HEALTH_READY_TIMEOUT_MS = REQUEST_PATH_OPTIONS.connectTimeout;

/**
 * Resolve once the client can actually accept commands, or reject on timeout.
 *
 * ioredis reports `status: 'ready'` only after the handshake completes. Before
 * that, a client built with `enableOfflineQueue: false` rejects commands
 * outright rather than queuing them — so pinging a still-connecting client
 * looks exactly like pinging a dead one.
 */
function waitUntilReady(client, timeoutMs) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      cleanup();
      reject(new Error('Redis did not become ready in time'));
    }, timeoutMs);

    function cleanup() {
      clearTimeout(timer);
      client.removeListener('ready', onReady);
      client.removeListener('error', onError);
    }
    function onReady() {
      cleanup();
      resolve();
    }
    function onError(err) {
      cleanup();
      reject(err);
    }

    client.once('ready', onReady);
    client.once('error', onError);
  });
}

/**
 * Is Redis usable *right now*, answered without waiting.
 *
 * This is the request path's question. `cacheUtils` asks it on every cache read
 * and write, so it must never block: during an outage the right behaviour is to
 * miss the cache and go to the database immediately. Waiting here would turn a
 * Redis outage into seconds of added latency on every request — the exact
 * failure mode the two client shapes above exist to prevent.
 *
 * It calls `getRedisClient()` rather than testing `defaultClient` directly so
 * that the answer never depends on whether some unrelated code path happened to
 * construct the singleton first.
 */
export async function isRedisConnected() {
  try {
    const client = getRedisClient();
    if (client.status !== 'ready') {
      return false;
    }
    return (await client.ping()) === 'PONG';
  } catch {
    return false;
  }
}

/**
 * Is Redis reachable — the question a health probe is actually asking.
 *
 * Distinct from `isRedisConnected` because a monitor wants to know whether the
 * dependency is up, not whether a connection happens to be warm already. The
 * old check returned false whenever the lazily-built singleton did not exist
 * yet, so the first `/health` on a freshly booted process reported
 * `redis: "disconnected"` and `status: "degraded"` against a healthy Redis.
 * `/health` is mounted outside the `/api` router and so never passes through
 * the rate limiter, which is the middleware that would otherwise have built the
 * client — meaning a container receiving only readiness probes stayed
 * "degraded" indefinitely and could page for an outage that was not happening.
 */
/**
 * ioredis's own word for what the connection is doing.
 *
 * "disconnected" tells an operator nothing actionable: `reconnecting` is a blip
 * healing itself, `end` is a client that has given up and will never recover
 * without a restart, and `not-created` means nothing has asked for Redis yet.
 * Those need three different responses, so the health payload reports which.
 */
export function getRedisStatus() {
  return defaultClient ? defaultClient.status : 'not-created';
}

/**
 * Throw the request-path client away and build a new one.
 *
 * The last resort for a client that cannot recover on its own. ioredis's
 * `disconnect(true)` is no help there: it delegates to
 * `connector.disconnect()`, which calls `end()` on the socket — and a socket
 * that is already destroyed emits nothing, so no close handler runs and the
 * status never leaves `'ready'`. Nothing short of a new client clears it.
 *
 * Safe to swap underneath callers because every one of them — the rate
 * limiter, auth, the cache — calls `getRedisClient()` per operation rather
 * than holding a reference.
 */
function recreateDefaultClient() {
  const stale = defaultClient;
  defaultClient = null;

  if (stale) {
    try {
      // Drop our listeners first, or the dying client logs a close/end that
      // reads as though the fresh one failed.
      stale.removeAllListeners();
      stale.disconnect();
    } catch {
      // It is already broken; there is nothing to salvage.
    }
  }

  return getRedisClient();
}

export async function checkRedisHealth({ timeoutMs = HEALTH_READY_TIMEOUT_MS } = {}) {
  const client = getRedisClient();

  try {
    if (client.status !== 'ready') {
      await waitUntilReady(client, timeoutMs);
    }
    return (await client.ping()) === 'PONG';
  } catch {
    /**
     * A client reporting `ready` while PING fails is wedged: its socket is
     * destroyed but no close handler ever ran, so ioredis still believes it is
     * connected and will never reconnect. Every caller then falls through to a
     * degraded path — auth sessions in a Map, rate limits per-process — for the
     * life of the process, while Redis is up and reachable the whole time.
     *
     * Keep-alive is what should stop this happening. The probe is the only
     * thing positioned to see the contradiction, so it is also the thing that
     * clears it.
     */
    if (client.status === 'ready') {
      logger.warn('Redis reported ready but failed PING; replacing the wedged client');
      recreateDefaultClient();
    }
    return false;
  }
}

export async function closeRedis() {
  // Both clients, or the queue connection keeps the process alive on shutdown
  // and stops Jest exiting.
  const clients = [defaultClient, queueClient].filter(Boolean);
  defaultClient = null;
  queueClient = null;

  await Promise.all(
    clients.map(async (client) => {
      try {
        await client.quit();
      } catch {
        // `quit` throws if the connection is already gone, which is fine —
        // the goal is that no handle is left open.
        client.disconnect();
      }
    })
  );

  if (clients.length > 0) {
    logger.info('Redis clients closed');
  }
}

export default {
  createRedisClient,
  createPubSubClient,
  getRedisClient,
  getQueueConnection,
  isRedisConnected,
  checkRedisHealth,
  getRedisStatus,
  closeRedis,
};
