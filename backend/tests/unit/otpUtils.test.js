import { generateOtp, hashOtp, verifyOtpHash } from '../../src/utils/otpUtils.js';

describe('OTP Utils', () => {
  it('should generate a 6-digit numeric OTP', () => {
    const otp = generateOtp();
    expect(otp).toHaveLength(6);
    expect(/^\d{6}$/.test(otp)).toBe(true);
  });

  it('should hash OTP deterministically using SHA-256', () => {
    const otp = '123456';
    const hash1 = hashOtp(otp);
    const hash2 = hashOtp(otp);

    expect(hash1).toBe(hash2);
    expect(hash1).toHaveLength(64); // 256 bits in hex
  });

  it('should verify correct OTP and reject incorrect OTP', () => {
    const otp = '654321';
    const hash = hashOtp(otp);

    expect(verifyOtpHash(otp, hash)).toBe(true);
    expect(verifyOtpHash('000000', hash)).toBe(false);
    expect(verifyOtpHash('', hash)).toBe(false);
    expect(verifyOtpHash(null, hash)).toBe(false);
  });
});
