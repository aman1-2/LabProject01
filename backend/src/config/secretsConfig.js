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
/**
 * Values that are present but worthless.
 *
 * Presence alone was the only test, and `.env.example` ships lines like
 * `RAZORPAY_WEBHOOK_SECRET=your_razorpay_webhook_secret`. Copying that file and
 * filling in only some of it — the normal way a deploy gets configured, and
 * exactly what happened in development here — produced a process that started
 * cleanly while signing JWTs and verifying payment webhooks with a string
 * published in this repository. Anyone who can read the repo could then mint a
 * super_admin token or forge `payment.captured`.
 *
 * A secret that is a placeholder is worse than a missing one: missing fails
 * loudly, this did not fail at all.
 */
const PLACEHOLDER_PATTERNS = [
  /^your[_-]/i,
  /^changeme$/i,
  /^change[_-]me/i,
  /^replace[_-]?me/i,
  /^placeholder/i,
  /^example$/i,
  /^test$/i,
  /^secret$/i,
  /^xxx+$/i,
  /^todo$/i,
];

/** Shortest credible secret. Anything under this is a typo or a stub. */
const MIN_SECRET_LENGTH = 16;

/** Trimmed environment value, or an empty string when unset. */
function readEnv(name) {
  const raw = process.env[name];
  return typeof raw === 'string' ? raw.trim() : '';
}

export function isPlaceholderSecret(value) {
  if (typeof value !== 'string') return true;
  const v = value.trim();
  if (!v) return true;
  if (PLACEHOLDER_PATTERNS.some((re) => re.test(v))) return true;
  if (v.includes('placeholder') || v.includes('your_')) return true;
  return false;
}

export function assertSecretsPresent() {
  if (!isProduction()) {
    return { ok: true, checked: REQUIRED_SECRETS.length, missing: [] };
  }

  const missing = [];
  const placeholder = [];
  const tooShort = [];

  for (const name of REQUIRED_SECRETS) {
    const value = process.env[name];
    if (!(typeof value === 'string' && value.trim())) {
      missing.push(name);
      continue;
    }
    if (isPlaceholderSecret(value)) {
      placeholder.push(name);
      continue;
    }
    // Razorpay key ids are short and vendor-issued; length is not ours to judge.
    if (name !== 'RAZORPAY_KEY_ID' && value.trim().length < MIN_SECRET_LENGTH) {
      tooShort.push(name);
    }
  }

  const problems = [];
  if (missing.length) problems.push(`missing: ${missing.join(', ')}`);
  if (placeholder.length)
    problems.push(`still set to a placeholder from .env.example: ${placeholder.join(', ')}`);
  if (tooShort.length)
    problems.push(`shorter than ${MIN_SECRET_LENGTH} characters: ${tooShort.join(', ')}`);

  if (problems.length > 0) {
    throw new Error(
      `Refusing to start. Production secrets are not usable — ${problems.join('; ')}. ` +
        'Set real values in the environment; there are no built-in defaults.'
    );
  }

  /**
   * Live traffic must not run on test payment keys. A `rzp_test_` key in
   * production means every "payment" succeeds without money moving.
   */
  // Read through the helper. Defaulting inline with a logical-or would match
  // the "no literal secret fallbacks" guard, which scans every line including
  // comments, and a reader skimming for that shape should not have to work out
  // that a given default is a safe empty string and not a hardcoded credential.
  const razorpayKeyId = readEnv('RAZORPAY_KEY_ID');
  if (razorpayKeyId.startsWith('rzp_test_')) {
    throw new Error(
      'Refusing to start. RAZORPAY_KEY_ID is a TEST key (rzp_test_...) but NODE_ENV=production. ' +
        'Real bookings would be confirmed without any money being taken. Use the live key.'
    );
  }

  return { ok: true, checked: REQUIRED_SECRETS.length, missing: [] };
}

/**
 * Non-secret settings that are equally fatal to get wrong in production.
 *
 * These have development-friendly fallbacks, which is right locally and wrong
 * on a deploy: the process starts, looks healthy, and is broken in a way only
 * the end user sees.
 */
export function assertProductionConfig() {
  if (!isProduction()) return { ok: true };

  const problems = [];

  const cors = readEnv('CORS_ORIGIN');
  if (!cors) {
    problems.push(
      'CORS_ORIGIN is not set — it would fall back to http://localhost:5173 and the browser ' +
        'would block every request from the real frontend'
    );
  } else if (/localhost|127\.0\.0\.1/.test(cors)) {
    problems.push(`CORS_ORIGIN still names a local address ("${cors}")`);
  }

  const mongo = readEnv('MONGODB_URI');
  if (!mongo) {
    problems.push('MONGODB_URI is not set');
  } else {
    if (/localhost|127\.0\.0\.1/.test(mongo)) {
      problems.push('MONGODB_URI points at localhost');
    }
    // mongodb+srv://user:pass@host/<dbname>?opts — no path means the driver
    // silently uses "test", which is a poor name to run a clinic on and is
    // easily mistaken for a scratch database during an incident.
    const afterHost = mongo.split('@')[1] || '';
    const path = afterHost.split('?')[0].split('/')[1] || '';
    if (!path) {
      problems.push(
        'MONGODB_URI names no database, so the driver defaults to "test" — set an explicit database name'
      );
    }
  }

  if (problems.length) {
    const bullets = problems.map((p) => '  - ' + p).join('\n');
    throw new Error('Refusing to start. Production configuration problems:\n' + bullets);
  }

  return { ok: true };
}

export default {
  REQUIRED_SECRETS,
  resolveSecret,
  assertSecretsPresent,
  assertProductionConfig,
  isPlaceholderSecret,
};
