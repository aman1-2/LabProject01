import crypto from 'node:crypto';

export function generateOtp() {
  // Generate a cryptographically secure 6-digit number string
  const num = crypto.randomInt(100000, 1000000);
  return num.toString();
}

export function hashOtp(otp) {
  return crypto.createHash('sha256').update(otp.trim()).digest('hex');
}

export function verifyOtpHash(plainOtp, storedHash) {
  if (!plainOtp || !storedHash) return false;
  const incomingHash = hashOtp(plainOtp);
  const a = Buffer.from(incomingHash, 'hex');
  const b = Buffer.from(storedHash, 'hex');
  if (a.length !== b.length) return false;
  return crypto.timingSafeEqual(a, b);
}

export default { generateOtp, hashOtp, verifyOtpHash };
