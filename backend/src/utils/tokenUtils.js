import crypto from 'node:crypto';
import jwt from 'jsonwebtoken';
import { resolveSecret } from '../config/secretsConfig.js';

// Resolved lazily: no hardcoded fallback, and production refuses to run without
// JWT_SECRET rather than signing with a value published in this repository.
const ACCESS_TOKEN_EXPIRY = '15m'; // 15 minutes per specs
export const REFRESH_TOKEN_TTL_SECONDS = 30 * 24 * 60 * 60; // 30 days

export function generateAccessToken(payload) {
  const jti = crypto.randomUUID();
  return jwt.sign(
    {
      userId: payload._id ? payload._id.toString() : payload.userId,
      accountHandle: payload.accountHandle,
      role: payload.role,
      jti,
    },
    resolveSecret('JWT_SECRET'),
    { expiresIn: ACCESS_TOKEN_EXPIRY }
  );
}

export function verifyAccessToken(token) {
  return jwt.verify(token, resolveSecret('JWT_SECRET'));
}

export function generateOpaqueRefreshToken() {
  return crypto.randomBytes(48).toString('hex');
}

export function hashToken(token) {
  return crypto.createHash('sha256').update(token).digest('hex');
}

export default {
  generateAccessToken,
  verifyAccessToken,
  generateOpaqueRefreshToken,
  hashToken,
  REFRESH_TOKEN_TTL_SECONDS,
};
