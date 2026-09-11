import { redactPII } from '../../src/utils/logger.js';

describe('Logger PII Redaction', () => {
  it('should redact sensitive keys at the root level', () => {
    const payload = {
      name: 'Test Patient',
      password: 'supersecretpassword',
      token: 'jwt.token.here',
      otp: '123456',
    };

    const redacted = redactPII(payload);

    expect(redacted.name).toBe('Test Patient');
    expect(redacted.password).toBe('[REDACTED]');
    expect(redacted.token).toBe('[REDACTED]');
    expect(redacted.otp).toBe('[REDACTED]');
  });

  it('should recursively redact nested sensitive keys', () => {
    const payload = {
      user: {
        profile: {
          accountNumber: '9876543210',
          creditCard: '4111222233334444',
          city: 'Dehradun',
        },
      },
    };

    const redacted = redactPII(payload);

    expect(redacted.user.profile.city).toBe('Dehradun');
    expect(redacted.user.profile.accountNumber).toBe('[REDACTED]');
    expect(redacted.user.profile.creditCard).toBe('[REDACTED]');
  });

  it('should handle null, undefined, and non-object inputs gracefully', () => {
    expect(redactPII(null)).toBeNull();
    expect(redactPII(undefined)).toBeUndefined();
    expect(redactPII('plain string')).toBe('plain string');
    expect(redactPII(123)).toBe(123);
  });
  // -- HIGH H6 regression ---------------------------------------------------
  // `phone` was absent from SENSITIVE_KEYS, so authService logged it in
  // cleartext on every OTP request. It is the platform's unique user
  // identifier and, on a diagnostics platform, health-adjacent PII (§9.10).
  it('H6: redacts phone numbers and their common key spellings', () => {
    const redacted = redactPII({
      phone: '9876543210',
      phoneNumber: '+91 98765 43210',
      mobile: '9123456780',
      contact_phone: '9000000000',
      otpToken: 'safe-to-log',
    });

    expect(redacted.phone).toBe('[REDACTED]');
    expect(redacted.phoneNumber).toBe('[REDACTED]');
    expect(redacted.mobile).toBe('[REDACTED]');
    expect(redacted.contact_phone).toBe('[REDACTED]');
    // Correlation identifiers remain usable for incident response.
    expect(redacted.otpToken).toBe('safe-to-log');
  });

  it('H6: redacts a phone nested inside a user object', () => {
    const redacted = redactPII({ user: { name: 'Real Person', phone: '9876543210' } });

    expect(redacted.user.phone).toBe('[REDACTED]');
    expect(redacted.user.name).toBe('Real Person');
  });

  it('H6: redacts an echoed OTP under either key spelling', () => {
    const redacted = redactPII({ otp: '123456', debugOtp: '654321' });

    expect(redacted.otp).toBe('[REDACTED]');
    expect(redacted.debugOtp).toBe('[REDACTED]');
  });
});
