// backend/src/config/rateLimitConfig.js
import dotenv from 'dotenv';

dotenv.config();

function intFromEnv(name, fallback) {
  const raw = process.env[name];
  const parsed = parseInt(raw ?? '', 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

/**
 *
 * | Scope                     | Limit   | Window  |
 * | ------------------------- | ------- | ------- |
 * | Unauthenticated per IP    | 100 req | 1 min   |
 * | Authenticated per user    | 500 req | 1 min   |
 * | OTP send per mobile       | 5 req   | 1 hour  |
 * | OTP send per IP           | 20 req  | 1 hour  |
 * | Login attempts per handle | 10 req  | 15 min  |
 * | Payment webhook           | NONE    | —       |
 */
export const RATE_LIMITS = {
  unauthenticated: {
    max: intFromEnv('RATE_LIMIT_UNAUTH_MAX', 100),
    windowSeconds: intFromEnv('RATE_LIMIT_UNAUTH_WINDOW_SECONDS', 60),
  },
  authenticated: {
    max: intFromEnv('RATE_LIMIT_AUTH_MAX', 500),
    windowSeconds: intFromEnv('RATE_LIMIT_AUTH_WINDOW_SECONDS', 60),
  },
  otpPerPhone: {
    max: intFromEnv('RATE_LIMIT_OTP_PHONE_MAX', 5),
    windowSeconds: intFromEnv('RATE_LIMIT_OTP_PHONE_WINDOW_SECONDS', 3600),
  },
  otpPerIp: {
    max: intFromEnv('RATE_LIMIT_OTP_IP_MAX', 20),
    windowSeconds: intFromEnv('RATE_LIMIT_OTP_IP_WINDOW_SECONDS', 3600),
  },
  loginPerHandle: {
    max: intFromEnv('RATE_LIMIT_LOGIN_MAX', 10),
    windowSeconds: intFromEnv('RATE_LIMIT_LOGIN_WINDOW_SECONDS', 900),
  },
};

/**
 * Paths the global limiter must NEVER throttle.
 *
 * "Never rate-limit the payment webhook." Razorpay retries
 * aggressively and a 429 there loses payment state. Matched as a path segment
 * so it holds under both the /api and /api/v1 mounts.
 */
export const RATE_LIMIT_EXEMPT_PATTERNS = [/(^|\/)webhooks(\/|$)/];

export function isRateLimitExempt(path) {
  return RATE_LIMIT_EXEMPT_PATTERNS.some((pattern) => pattern.test(path));
}

export default { RATE_LIMITS, RATE_LIMIT_EXEMPT_PATTERNS, isRateLimitExempt };
