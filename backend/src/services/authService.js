import crypto from 'node:crypto';
import userRepository from '../repositories/userRepository.js';
import { hashPassword, comparePassword } from '../utils/passwordUtils.js';
import { generateOtp, hashOtp, verifyOtpHash } from '../utils/otpUtils.js';
import {
  generateAccessToken,
  generateOpaqueRefreshToken,
  hashToken,
  REFRESH_TOKEN_TTL_SECONDS,
  verifyAccessToken,
} from '../utils/tokenUtils.js';
import { getRedisClient } from '../config/redisConfig.js';
import AppError from '../utils/AppError.js';
import logger from '../utils/logger.js';

const OTP_TTL_SECONDS = parseInt(process.env.OTP_TTL_SECONDS || '60', 10);

/**
 * May the plaintext OTP be echoed back to the caller?
 *
 * This was `process.env.NODE_ENV !== 'production'`, which is fail-OPEN: an
 * unset, misspelled or 'staging' NODE_ENV returned the OTP in the response
 * body, which together with a phone-enumeration oracle is account takeover for
 * any known number. An explicit allowlist fails closed for every value that is
 * not a known-safe local environment.
 */
function isOtpEchoAllowed() {
  return process.env.NODE_ENV === 'development' || process.env.NODE_ENV === 'test';
}

// In-memory fallback cache for pending registrations and refresh tokens (when Redis is offline/testing)
const memoryCache = new Map();

async function setCache(key, value, ttlSeconds) {
  try {
    const redis = getRedisClient();
    if (redis && redis.status === 'ready') {
      await redis.set(key, JSON.stringify(value), 'EX', ttlSeconds);
      return;
    }
  } catch {
    // fallback to memory
  }

  memoryCache.set(key, {
    val: value,
    expiresAt: Date.now() + ttlSeconds * 1000,
  });
}

async function getCache(key) {
  try {
    const redis = getRedisClient();
    if (redis && redis.status === 'ready') {
      const data = await redis.get(key);
      return data ? JSON.parse(data) : null;
    }
  } catch {
    // fallback to memory
  }

  const entry = memoryCache.get(key);
  if (!entry) return null;
  if (Date.now() > entry.expiresAt) {
    memoryCache.delete(key);
    return null;
  }
  return entry.val;
}

async function delCache(key) {
  try {
    const redis = getRedisClient();
    if (redis && redis.status === 'ready') {
      await redis.del(key);
      return;
    }
  } catch {
    // fallback to memory
  }
  memoryCache.delete(key);
}

function sanitizeUser(user) {
  const obj = user.toObject ? user.toObject() : { ...user };
  delete obj.passwordHash;
  delete obj.__v;
  return obj;
}

/**
 * 1. Check account handle availability
 */
export async function checkHandleAvailable(handle) {
  if (!handle) {
    throw new AppError('Handle is required', 400, 'VALIDATION_ERROR');
  }
  const cleanHandle = handle.toLowerCase().trim();
  const existing = await userRepository.findByHandle(cleanHandle);
  return { available: !existing };
}

/**
 * 2. Initiate signup:
 * Validates, hashes password (cost 12), generates OTP, stores in Redis, returns otpToken.
 * DOES NOT create user in DB yet.
 */
export async function initiateSignup(signupData) {
  const { accountHandle, phone, name, password, accountType, location } = signupData;

  // Check unique handle
  const existingHandle = await userRepository.findByHandle(accountHandle);
  if (existingHandle) {
    throw new AppError('Account handle is already taken', 409, 'DUPLICATE_KEY_ERROR', {
      field: 'accountHandle',
    });
  }

  // Check unique phone
  const existingPhone = await userRepository.findByPhone(phone);
  if (existingPhone) {
    throw new AppError('Phone number is already registered', 409, 'DUPLICATE_KEY_ERROR', {
      field: 'phone',
    });
  }

  // Hash password with bcrypt cost 12
  const passwordHash = await hashPassword(password);

  // Generate 6-digit OTP and hash it
  const plainOtp = generateOtp();
  const otpHash = hashOtp(plainOtp);
  const otpToken = crypto.randomUUID();

  // Cache pending registration in Redis with 60s TTL
  const pendingData = {
    accountHandle,
    phone,
    name,
    passwordHash,
    accountType: accountType || 'single',
    location,
    otpHash,
    attempts: 0,
  };

  await setCache(`pending:signup:${otpToken}`, pendingData, OTP_TTL_SECONDS);

  // The OTP is never logged: `otp` is redacted by the logger anyway, and there
  // is no reason to write it at all. `phone` is redacted too (CONTEXT §9.10).
  logger.info('Signup initiated with OTP', { phone, otpToken });

  return {
    otpToken,
    expiresIn: OTP_TTL_SECONDS,
    // Local environments only; fails closed everywhere else.
    ...(isOtpEchoAllowed() ? { debugOtp: plainOtp } : {}),
  };
}

/**
 * 3. Verify OTP and create user:
 * Atomically creates user in DB, issues access & refresh tokens.
 */
export async function verifyOtpAndCreateUser(otpToken, otp) {
  const cacheKey = `pending:signup:${otpToken}`;
  const pending = await getCache(cacheKey);

  if (!pending) {
    throw new AppError('OTP expired or session invalid. Please sign up again.', 400, 'OTP_EXPIRED');
  }

  const isValid = verifyOtpHash(otp, pending.otpHash);
  if (!isValid) {
    pending.attempts += 1;
    if (pending.attempts >= 3) {
      await delCache(cacheKey);
      throw new AppError('Too many failed attempts. Please sign up again.', 400, 'MAX_ATTEMPTS_EXCEEDED');
    }
    await setCache(cacheKey, pending, OTP_TTL_SECONDS);
    throw new AppError('Invalid OTP', 400, 'INVALID_OTP');
  }

  // OTP verified: invalidate immediately (single-use)
  await delCache(cacheKey);

  // Atomically create user in MongoDB
  let user;
  try {
    user = await userRepository.create({
      accountHandle: pending.accountHandle,
      phone: pending.phone,
      name: pending.name,
      passwordHash: pending.passwordHash,
      accountType: pending.accountType,
      location: pending.location,
      role: 'patient',
      isVerified: true,
    });
  } catch (error) {
    if (error.code === 11000) {
      throw new AppError(
        'Account handle or phone number was registered by another session.',
        409,
        'DUPLICATE_KEY_ERROR'
      );
    }
    throw error;
  }

  // Issue 15m access token & 30d opaque refresh token
  const token = generateAccessToken(user);
  const refreshToken = generateOpaqueRefreshToken();
  const hashedRefreshToken = hashToken(refreshToken);

  // Store hashed refresh token in Redis
  await setCache(
    `refresh_token:${hashedRefreshToken}`,
    { userId: user._id.toString() },
    REFRESH_TOKEN_TTL_SECONDS
  );

  return {
    token,
    refreshToken,
    user: sanitizeUser(user),
  };
}

/**
 * 4. Login with accountHandle + password
 */
export async function loginWithPassword(accountHandle, password) {
  const user = await userRepository.findByHandle(accountHandle);
  if (!user) {
    throw new AppError('Invalid handle or password', 401, 'INVALID_CREDENTIALS');
  }

  const isMatch = await comparePassword(password, user.passwordHash);
  if (!isMatch) {
    throw new AppError('Invalid handle or password', 401, 'INVALID_CREDENTIALS');
  }

  const token = generateAccessToken(user);
  const refreshToken = generateOpaqueRefreshToken();
  const hashedRefreshToken = hashToken(refreshToken);

  await setCache(
    `refresh_token:${hashedRefreshToken}`,
    { userId: user._id.toString() },
    REFRESH_TOKEN_TTL_SECONDS
  );

  return {
    token,
    refreshToken,
    user: sanitizeUser(user),
  };
}

/**
 * 5. Initiate Login with OTP:
 * Sends OTP to registered phone, returns otpToken.
 */
export async function initiateLoginOtp(phone) {
  const user = await userRepository.findByPhone(phone);

  if (!user) {
    // Do NOT reveal whether this number is registered. Returning 404 here made
    // the endpoint a phone-enumeration oracle, which is what turns an echoed
    // OTP into account takeover. Respond exactly as for a known number; the
    // opaque token simply never verifies.
    logger.warn('Login OTP requested for an unregistered number', { phone });
    return {
      otpToken: crypto.randomUUID(),
      expiresIn: OTP_TTL_SECONDS,
    };
  }

  const plainOtp = generateOtp();
  const otpHash = hashOtp(plainOtp);
  const otpToken = crypto.randomUUID();

  await setCache(
    `pending:login:${otpToken}`,
    { userId: user._id.toString(), phone, otpHash, attempts: 0 },
    OTP_TTL_SECONDS
  );

  logger.info('Login OTP generated', { phone, otpToken });

  return {
    otpToken,
    expiresIn: OTP_TTL_SECONDS,
    // Local environments only; fails closed everywhere else.
    ...(isOtpEchoAllowed() ? { debugOtp: plainOtp } : {}),
  };
}

/**
 * 6. Verify Login OTP:
 * Validates OTP and authenticates user.
 */
export async function verifyLoginOtp(otpToken, otp) {
  const cacheKey = `pending:login:${otpToken}`;
  const pending = await getCache(cacheKey);

  if (!pending) {
    throw new AppError('OTP expired or session invalid. Please request a new OTP.', 400, 'OTP_EXPIRED');
  }

  const isValid = verifyOtpHash(otp, pending.otpHash);
  if (!isValid) {
    pending.attempts += 1;
    if (pending.attempts >= 3) {
      await delCache(cacheKey);
      throw new AppError('Too many failed attempts. Please request a new OTP.', 400, 'MAX_ATTEMPTS_EXCEEDED');
    }
    await setCache(cacheKey, pending, OTP_TTL_SECONDS);
    throw new AppError('Invalid OTP', 400, 'INVALID_OTP');
  }

  // Invalidate OTP immediately
  await delCache(cacheKey);

  const user = await userRepository.findById(pending.userId);
  if (!user) {
    throw new AppError('User not found', 404, 'USER_NOT_FOUND');
  }

  const token = generateAccessToken(user);
  const refreshToken = generateOpaqueRefreshToken();
  const hashedRefreshToken = hashToken(refreshToken);

  await setCache(
    `refresh_token:${hashedRefreshToken}`,
    { userId: user._id.toString() },
    REFRESH_TOKEN_TTL_SECONDS
  );

  return {
    token,
    refreshToken,
    user: sanitizeUser(user),
  };
}

/**
 * 7. Rotate Refresh Token:
 * Validates opaque refresh token, revokes it, and issues a fresh pair.
 */
export async function rotateRefreshToken(rawRefreshToken) {
  if (!rawRefreshToken) {
    throw new AppError('Refresh token required', 401, 'UNAUTHORIZED');
  }

  const oldHashedToken = hashToken(rawRefreshToken);
  const cacheKey = `refresh_token:${oldHashedToken}`;
  const stored = await getCache(cacheKey);

  if (!stored) {
    throw new AppError('Invalid or expired refresh token', 401, 'INVALID_REFRESH_TOKEN');
  }

  // Single-use: Invalidate old refresh token immediately (rotation)
  await delCache(cacheKey);

  const user = await userRepository.findById(stored.userId);
  if (!user) {
    throw new AppError('User not found', 401, 'UNAUTHORIZED');
  }

  // Issue new access token & new opaque refresh token
  const newAccessToken = generateAccessToken(user);
  const newRefreshToken = generateOpaqueRefreshToken();
  const newHashedToken = hashToken(newRefreshToken);

  await setCache(
    `refresh_token:${newHashedToken}`,
    { userId: user._id.toString() },
    REFRESH_TOKEN_TTL_SECONDS
  );

  return {
    token: newAccessToken,
    refreshToken: newRefreshToken,
    user: sanitizeUser(user),
  };
}

/**
 * 8. Logout:
 * Revokes refresh token and adds access token to Redis denylist.
 */
export async function logout(accessToken, rawRefreshToken) {
  if (rawRefreshToken) {
    const hashed = hashToken(rawRefreshToken);
    await delCache(`refresh_token:${hashed}`);
  }

  if (accessToken) {
    try {
      const decoded = verifyAccessToken(accessToken);
      if (decoded.jti && decoded.exp) {
        const remainingSeconds = decoded.exp - Math.floor(Date.now() / 1000);
        if (remainingSeconds > 0) {
          await setCache(`denylist:jti:${decoded.jti}`, true, remainingSeconds);
        }
      }
    } catch {
      // ignore invalid access tokens on logout
    }
  }

  return { success: true };
}


/**
 * Lets a signed-in user replace their own password.
 *
 * Requires the current one even though they are already authenticated: an
 * unattended session should not be enough to lock the real owner out of their
 * account. It also clears `mustChangePassword`, which is the whole point for a
 * staff member whose password was chosen by an admin.
 */
export async function changePassword({ userId, currentPassword, newPassword }) {
  const user = await userRepository.findById(userId);
  if (!user) {
    throw new AppError('Account not found', 404, 'USER_NOT_FOUND');
  }

  const matches = await comparePassword(String(currentPassword), user.passwordHash);
  if (!matches) {
    throw new AppError('That is not your current password', 401, 'INVALID_CREDENTIALS');
  }

  if (String(currentPassword) === String(newPassword)) {
    // Otherwise a staff member can satisfy "change your password" by retyping
    // the one the admin already knows, which defeats the requirement.
    throw new AppError(
      'Your new password must be different from your current one',
      422,
      'PASSWORD_UNCHANGED'
    );
  }

  user.passwordHash = await hashPassword(String(newPassword));
  user.mustChangePassword = false;
  await user.save();

  logger.info('Password changed', { userId: String(userId) });

  return { changed: true };
}

export default {
  checkHandleAvailable,
  initiateSignup,
  verifyOtpAndCreateUser,
  loginWithPassword,
  initiateLoginOtp,
  verifyLoginOtp,
  rotateRefreshToken,
  logout,
  changePassword,
};
