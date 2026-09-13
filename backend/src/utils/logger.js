/**
 * Structured Logger with PII Redaction
 */

// PII & Sensitive Fields Denylist / Masking Targets
const SENSITIVE_KEYS = new Set([
  // Phone is the platform's unique user identifier (User.phone, unique index)
  // and, on a diagnostics platform, a log line pairing it with a signup or
  // login event is health-adjacent PII. CONTEXT §9.10.
  'phone',
  'phonenumber',
  'mobile',
  'mobilenumber',
  'contactphone',
  'expopushtoken',
  'pushtoken',
  'devicetoken',
  'password',
  'passwordhash',
  'token',
  'jwt',
  'refreshtoken',
  'otp',
  'debugotp',
  'authorization',
  'cookie',
  'creditcard',
  'cardnumber',
  'cvv',
  'accountnumber',
  'pan',
  'aadhaar',
  'secret',
  'signature',
  'x-razorpay-signature',
]);

/**
 * Deeply redact sensitive keys in objects
 */
export function redactPII(data, depth = 0) {
  if (depth > 5 || !data || typeof data !== 'object') {
    return data;
  }

  if (Array.isArray(data)) {
    return data.map((item) => redactPII(item, depth + 1));
  }

  const sanitized = {};
  for (const [key, value] of Object.entries(data)) {
    const normalizedKey = key.toLowerCase().replace(/[-_]/g, '');
    if (SENSITIVE_KEYS.has(normalizedKey)) {
      sanitized[key] = '[REDACTED]';
    } else if (typeof value === 'object' && value !== null) {
      sanitized[key] = redactPII(value, depth + 1);
    } else {
      sanitized[key] = value;
    }
  }
  return sanitized;
}

function formatLog(level, message, meta = {}) {
  const sanitizedMeta = redactPII(meta);
  const logEntry = {
    timestamp: new Date().toISOString(),
    level,
    message,
    ...(Object.keys(sanitizedMeta || {}).length > 0 ? { meta: sanitizedMeta } : {}),
  };

  return JSON.stringify(logEntry);
}

export const logger = {
  info: (message, meta) => {
    process.stdout.write(`${formatLog('INFO', message, meta)}\n`);
  },
  warn: (message, meta) => {
    process.stderr.write(`${formatLog('WARN', message, meta)}\n`);
  },
  error: (message, meta) => {
    process.stderr.write(`${formatLog('ERROR', message, meta)}\n`);
  },
  debug: (message, meta) => {
    if (process.env.NODE_ENV !== 'production') {
      process.stdout.write(`${formatLog('DEBUG', message, meta)}\n`);
    }
  },
};

export default logger;
