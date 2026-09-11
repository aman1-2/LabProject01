// backend/src/config/secretsConfig.js
import crypto from 'node:crypto';
import dotenv from 'dotenv';
import logger from '../utils/logger.js';

dotenv.config();

/**
 * Secrets the process cannot safely run without.
 *
 * Every one of these previously had a hardcoded `||` fallback in source. Those
 * fallbacks did not fail loudly — they made the system appear to work while
 * providing no security. With RAZORPAY_WEBHOOK_SECRET unset, webhook HMAC was
 * verified against a string published in this repository, so anyone could forge
 * a `payment.captured` and mark a booking paid without paying. With JWT_SECRET
 * unset, anyone could mint a super_admin token.
 */
export const REQUIRED_SECRETS = [
  'JWT_SECRET',
  'RAZORPAY_KEY_ID',
  'RAZORPAY_KEY_SECRET',
  'RAZORPAY_WEBHOOK_SECRET',
  'STORAGE_SIGNING_SECRET',
];

// Ephemeral values generated for non-production runs, cached so that a value
// signed and a value verified within one process always match.
const ephemeral = new Map();
const warned = new Set();

function isProduction() {
  return process.env.NODE_ENV === 'production';
}

/**
 * Resolve a secret.
 *
 * In production a missing secret throws — the process must not start with a
 * guessable key. Outside production a random per-process value is generated so
 * that dev and tests work without any secret being committed to the repository.
 */
export function resolveSecret(name) {
  const fromEnv = process.env[name];
  if (typeof fromEnv === 'string' && fromEnv.trim()) {
    return fromEnv.trim();
  }

  if (isProduction()) {
    throw new Error(
      `${name} is not set. Refusing to start: a production process must never fall back to a default secret.`
    );
  }

  if (!ephemeral.has(name)) {
    ephemeral.set(name, crypto.randomBytes(32).toString('hex'));
    if (!warned.has(name)) {
      warned.add(name);
      logger.warn(
        `${name} is not set; generated an ephemeral value for this process only. Never rely on this outside local development.`
      );
    }
  }

  return ephemeral.get(name);
}

/**
 * Boot-time gate. Throws listing EVERY missing secret at once rather than
 * failing one at a time on first use.
 */
export function assertSecretsPresent() {
  if (!isProduction()) {
    return { ok: true, checked: REQUIRED_SECRETS.length, missing: [] };
  }

  const missing = REQUIRED_SECRETS.filter((name) => {
    const value = process.env[name];
    return !(typeof value === 'string' && value.trim());
  });

  if (missing.length > 0) {
    throw new Error(
      `Refusing to start. Missing required secret(s): ${missing.join(', ')}. ` +
        'Set them in the environment; there are no built-in defaults.'
    );
  }

  return { ok: true, checked: REQUIRED_SECRETS.length, missing: [] };
}

export default { REQUIRED_SECRETS, resolveSecret, assertSecretsPresent };
