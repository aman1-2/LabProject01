import { jest } from '@jest/globals';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  REQUIRED_SECRETS,
  resolveSecret,
  assertSecretsPresent,
} from '../../src/config/secretsConfig.js';

/**
 * BLOCKER #11 regression.
 *
 * razorpayConfig.js, tokenUtils.js and s3StorageService.js each carried a
 * working hardcoded secret as a `||` fallback. A deployment with the env var
 * unset ran on a value published in this repository: webhook HMAC verified
 * against a known string (forge a payment.captured, get a free booking), and
 * JWTs signed with a known key (mint a super_admin token).
 */
describe('Secrets are required, never defaulted (BLOCKER #11)', () => {
  const ORIGINAL_ENV = { ...process.env };

  afterEach(() => {
    process.env = { ...ORIGINAL_ENV };
    jest.restoreAllMocks();
  });

  describe('resolveSecret', () => {
    it('returns the configured value when the env var is set', () => {
      process.env.JWT_SECRET = 'a_real_configured_secret_value';
      expect(resolveSecret('JWT_SECRET')).toBe('a_real_configured_secret_value');
    });

    it('THROWS in production when a secret is missing', () => {
      process.env.NODE_ENV = 'production';
      delete process.env.RAZORPAY_WEBHOOK_SECRET;

      expect(() => resolveSecret('RAZORPAY_WEBHOOK_SECRET')).toThrow(
        /RAZORPAY_WEBHOOK_SECRET is not set/
      );
    });

    it('treats an empty or whitespace value as missing in production', () => {
      process.env.NODE_ENV = 'production';
      process.env.JWT_SECRET = '   ';

      expect(() => resolveSecret('JWT_SECRET')).toThrow(/JWT_SECRET is not set/);
    });

    it('outside production generates a random value rather than a committed constant', () => {
      process.env.NODE_ENV = 'test';
      delete process.env.STORAGE_SIGNING_SECRET;

      const value = resolveSecret('STORAGE_SIGNING_SECRET');

      expect(typeof value).toBe('string');
      expect(value.length).toBeGreaterThanOrEqual(32);
      // The old fallbacks were guessable strings shipped in source.
      expect(value).not.toMatch(/pathcare/i);
      expect(value).not.toMatch(/rzp_test/i);
    });

    it('returns a STABLE ephemeral value within one process so sign and verify agree', () => {
      process.env.NODE_ENV = 'test';
      delete process.env.STORAGE_SIGNING_SECRET;

      expect(resolveSecret('STORAGE_SIGNING_SECRET')).toBe(
        resolveSecret('STORAGE_SIGNING_SECRET')
      );
    });
  });

  describe('assertSecretsPresent', () => {
    it('refuses to start in production when secrets are missing, listing every one', () => {
      process.env.NODE_ENV = 'production';
      for (const name of REQUIRED_SECRETS) {
        delete process.env[name];
      }

      let error;
      try {
        assertSecretsPresent();
      } catch (err) {
        error = err;
      }

      expect(error).toBeDefined();
      expect(error.message).toMatch(/Refusing to start/);
      for (const name of REQUIRED_SECRETS) {
        expect(error.message).toContain(name);
      }
    });

    it('passes in production once every secret is supplied', () => {
      process.env.NODE_ENV = 'production';
      for (const name of REQUIRED_SECRETS) {
        process.env[name] = `configured_value_for_${name}`;
      }

      expect(() => assertSecretsPresent()).not.toThrow();
    });

    it('names JWT_SECRET and RAZORPAY_WEBHOOK_SECRET among the required set', () => {
      // The two whose absence was directly exploitable.
      expect(REQUIRED_SECRETS).toContain('JWT_SECRET');
      expect(REQUIRED_SECRETS).toContain('RAZORPAY_WEBHOOK_SECRET');
    });
  });

  describe('no secret literals remain in source', () => {
    const HERE = path.dirname(fileURLToPath(import.meta.url));
    const SRC = path.resolve(HERE, '../../src');

    function jsFiles(dir) {
      const out = [];
      for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        const full = path.join(dir, entry.name);
        if (entry.isDirectory()) out.push(...jsFiles(full));
        else if (entry.name.endsWith('.js')) out.push(full);
      }
      return out;
    }

    it('has no `SECRET || "literal"` style fallback anywhere in backend/src', () => {
      // Matches: JWT_SECRET || 'x', WEBHOOK_SECRET || "x", KEY_SECRET || `x`
      const pattern = /(?:SECRET|KEY_ID)\s*\|\|\s*['"`]/;
      const offenders = [];

      for (const file of jsFiles(SRC)) {
        const contents = fs.readFileSync(file, 'utf8');
        contents.split('\n').forEach((line, i) => {
          if (pattern.test(line)) {
            offenders.push(`${path.relative(SRC, file).replace(/\\/g, '/')}:${i + 1}`);
          }
        });
      }

      expect(offenders).toEqual([]);
    });

    it('does not contain the specific strings that were previously committed', () => {
      const leaked = [
        'rzp_test_webhook_secret_key',
        'rzp_test_secret_key_32_chars_long',
        'pathcare_dev_jwt_secret_min_32_characters_long',
        'pathcare_storage_secret_signing_key_32c',
      ];
      const offenders = [];

      for (const file of jsFiles(SRC)) {
        const contents = fs.readFileSync(file, 'utf8');
        for (const literal of leaked) {
          if (contents.includes(literal)) {
            offenders.push(`${path.relative(SRC, file).replace(/\\/g, '/')} contains "${literal}"`);
          }
        }
      }

      expect(offenders).toEqual([]);
    });
  });
});
