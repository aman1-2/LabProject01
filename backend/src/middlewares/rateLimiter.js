import { getRedisClient } from '../config/redisConfig.js';
import { RATE_LIMITS, isRateLimitExempt } from '../config/rateLimitConfig.js';
import { verifyAccessToken } from '../utils/tokenUtils.js';
import AppError from '../utils/AppError.js';
import logger from '../utils/logger.js';

// Fallback in-memory map if Redis is not connected (e.g. isolated unit tests)
const memoryStore = new Map();

/** Prefix every counter shares, so a reset can find them all. */
const RATE_LIMIT_KEY_PREFIX = 'ratelimit:';

/**
 * Clear the counters.
 *
 * Test suites make far more requests from one address than any real client, so
 * without this they trip the very limits they are meant to leave alone.
 *
 * This cleared ONLY the in-memory map, which was silently sufficient while no
 * Redis was running. With a real Redis the limiter prefers it (see
 * `checkRateLimit`), and worse, `redis.status` flips to 'ready' partway through
 * a suite — so counts split across two stores and neither reached the limit.
 * Both stores have to be cleared, and the Redis half is async, so callers must
 * await this. Exists for tests only; production counters expire on their own.
 */
export async function resetRateLimitStore() {
  memoryStore.clear();

  let redis = null;
  try {
    redis = getRedisClient();
  } catch {
    return;
  }

  if (!redis || redis.status !== 'ready') return;

  try {
    // Scoped to rate-limit keys: this database also holds the rider geo index,
    // and a blanket flush here would delete a fixture the suite just created.
    const keys = await redis.keys(`${RATE_LIMIT_KEY_PREFIX}*`);
    if (keys.length > 0) await redis.del(...keys);
  } catch (err) {
    logger.warn('Could not clear Redis rate-limit counters', { error: err.message });
  }
}

async function checkRateLimit(key, maxLimit, windowSeconds) {
  let redis = null;
  try {
    redis = getRedisClient();
  } catch {
    // ignore
  }

  if (redis && redis.status === 'ready') {
    try {
      const current = await redis.incr(key);
      if (current === 1) {
        await redis.expire(key, windowSeconds);
      }
      return { allowed: current <= maxLimit, current, maxLimit };
    } catch (err) {
      logger.warn('Redis rate limiter error, falling back to memory store', { error: err.message });
    }
  }

  // Memory fallback
  const now = Date.now();
  const entry = memoryStore.get(key) || { count: 0, resetTime: now + windowSeconds * 1000 };

  if (now > entry.resetTime) {
    entry.count = 1;
    entry.resetTime = now + windowSeconds * 1000;
  } else {
    entry.count += 1;
  }
  memoryStore.set(key, entry);

  return { allowed: entry.count <= maxLimit, current: entry.count, maxLimit };
}


/**
 * Resolve the caller's identity for rate-limiting purposes.
 *
 * The global limiter runs BEFORE isAuthenticated, so req.user does not exist
 * yet. The bearer token is verified here (a cheap HMAC) purely to decide which
 * bucket applies — an invalid or absent token simply falls back to the IP
 * bucket. This middleware never rejects on authentication grounds; that stays
 * the job of isAuthenticated.
 */
function resolveRateLimitIdentity(req) {
  const header = req.headers.authorization;

  if (header && header.startsWith('Bearer ')) {
    try {
      const decoded = verifyAccessToken(header.slice(7).trim());
      if (decoded?.userId) {
        return { key: `ratelimit:user:${decoded.userId}`, limit: RATE_LIMITS.authenticated };
      }
    } catch {
      // Not a valid token — fall through to the per-IP bucket.
    }
  }

  return { key: `ratelimit:ip:${req.ip}`, limit: RATE_LIMITS.unauthenticated };
}

/**
 * Global rate limiter per CONTEXT §8: 100 req/min per IP unauthenticated,
 * 500 req/min per user authenticated.
 *
 * Mounted before the routers, so it covers every endpoint. §10 says blanket
 * limiting belongs to "ALB + WAF + Redis middleware"; infra/main.tf declares no
 * WAF, so without this middleware nothing limited anything at any layer.
 *
 * The payment webhook is exempt (CONTEXT §3.3).
 */
export function globalRateLimiter(req, res, next) {
  if (isRateLimitExempt(req.path)) {
    return next();
  }

  const { key, limit } = resolveRateLimitIdentity(req);

  checkRateLimit(key, limit.max, limit.windowSeconds)
    .then(({ allowed, current, maxLimit }) => {
      res.setHeader('X-RateLimit-Limit', maxLimit);
      res.setHeader('X-RateLimit-Remaining', Math.max(0, maxLimit - current));

      if (!allowed) {
        res.setHeader('Retry-After', limit.windowSeconds);
        logger.warn('Global rate limit exceeded', { key, maxLimit });
        return next(
          new AppError(
            'Too many requests. Please slow down and try again shortly.',
            429,
            'RATE_LIMIT_EXCEEDED',
            { retryAfter: limit.windowSeconds }
          )
        );
      }
      next();
    })
    .catch(next);
}

/**
 * OTP send per IP, 20/hour per CONTEXT §8. Complements otpRateLimiter, which
 * caps 5/hour per phone NUMBER: without this, one IP could farm unlimited
 * numbers at 5 requests each. Each OTP costs real money in SMS.
 */
export function otpIpRateLimiter(req, res, next) {
  const { max, windowSeconds } = RATE_LIMITS.otpPerIp;
  const key = `ratelimit:otp:ip:${req.ip}`;

  checkRateLimit(key, max, windowSeconds)
    .then(({ allowed }) => {
      if (!allowed) {
        res.setHeader('Retry-After', windowSeconds);
        return next(
          new AppError(
            'Too many OTP requests from this network. Please try again later.',
            429,
            'RATE_LIMIT_EXCEEDED',
            { retryAfter: windowSeconds }
          )
        );
      }
      next();
    })
    .catch(next);
}

/**
 * OTP Rate Limiter per CONTEXT §8:
 * Strictly 5 OTP sends per mobile per 1 hour (3600 seconds).
 */
export function otpRateLimiter(req, res, next) {
  const phone = req.body.phone || req.body.mobile;
  if (!phone) {
    return next();
  }

  const key = `ratelimit:otp:phone:${phone.trim()}`;
  const { max: maxRequests, windowSeconds } = RATE_LIMITS.otpPerPhone;

  checkRateLimit(key, maxRequests, windowSeconds)
    .then(({ allowed, current, maxLimit }) => {
      res.setHeader('X-RateLimit-Limit', maxLimit);
      res.setHeader('X-RateLimit-Remaining', Math.max(0, maxLimit - current));

      if (!allowed) {
        return next(
          new AppError(
            'Too many OTP requests for this number. Maximum 5 requests per hour allowed.',
            429,
            'RATE_LIMIT_EXCEEDED',
            { retryAfter: 3600 }
          )
        );
      }
      next();
    })
    .catch(next);
}

/**
 * Login Rate Limiter per CONTEXT §8:
 * 10 login attempts per handle per 15 minutes (900 seconds).
 */
export function loginRateLimiter(req, res, next) {
  const handle = req.body.accountHandle || req.body.handle || req.ip;
  const key = `ratelimit:login:${handle.toLowerCase().trim()}`;
  const { max: maxRequests, windowSeconds } = RATE_LIMITS.loginPerHandle;

  checkRateLimit(key, maxRequests, windowSeconds)
    .then(({ allowed, current, maxLimit }) => {
      res.setHeader('X-RateLimit-Limit', maxLimit);
      res.setHeader('X-RateLimit-Remaining', Math.max(0, maxLimit - current));

      if (!allowed) {
        return next(
          new AppError(
            'Too many login attempts. Please try again in 15 minutes.',
            429,
            'RATE_LIMIT_EXCEEDED',
            { retryAfter: 900 }
          )
        );
      }
      next();
    })
    .catch(next);
}

export default { globalRateLimiter, otpIpRateLimiter, otpRateLimiter, loginRateLimiter };
