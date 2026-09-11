import { verifyAccessToken } from '../utils/tokenUtils.js';
import { getRedisClient } from '../config/redisConfig.js';
import userRepository from '../repositories/userRepository.js';
import AppError from '../utils/AppError.js';

export async function isAuthenticated(req, res, next) {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return next(new AppError('Authentication required. Please log in.', 401, 'UNAUTHORIZED'));
    }

    const token = authHeader.split(' ')[1];
    let decoded;
    try {
      decoded = verifyAccessToken(token);
    } catch (err) {
      if (err.name === 'TokenExpiredError') {
        return next(new AppError('Access token has expired', 401, 'TOKEN_EXPIRED'));
      }
      return next(new AppError('Invalid access token', 401, 'INVALID_TOKEN'));
    }

    // Check Redis denylist for revoked tokens (force-logout)
    try {
      const redis = getRedisClient();
      if (redis && redis.status === 'ready' && decoded.jti) {
        const isDenylisted = await redis.get(`denylist:jti:${decoded.jti}`);
        if (isDenylisted) {
          return next(new AppError('Token has been revoked. Please log in again.', 401, 'TOKEN_REVOKED'));
        }
      }
    } catch {
      // If Redis check fails, continue with decoded token
    }

    // Attach user information to request
    req.user = {
      id: decoded.userId,
      userId: decoded.userId,
      accountHandle: decoded.accountHandle,
      role: decoded.role,
      jti: decoded.jti,
    };

    next();
  } catch (error) {
    next(error);
  }
}

/**
 * Role-based access control middleware
 */
export function hasRole(...allowedRoles) {
  const roleAliases = {
    labAdmin: 'lab_admin',
    superAdmin: 'super_admin',
  };

  const normalizedAllowed = allowedRoles.map((role) => roleAliases[role] || role);

  return async (req, res, next) => {
    try {
      if (!req.user) {
        return next(new AppError('Authentication required', 401, 'UNAUTHORIZED'));
      }

      const userRole = req.user.role;
      if (!normalizedAllowed.includes(userRole)) {
        return next(
          new AppError('You do not have permission to perform this action', 403, 'FORBIDDEN')
        );
      }

      // If user is lab_admin, populate their associated labCenterId if missing
      if (userRole === 'lab_admin' && !req.user.labCenterId) {
        const userDoc = await userRepository.findById(req.user.userId);
        if (userDoc?.labCenterId) {
          req.user.labCenterId = userDoc.labCenterId.toString();
        }
      }

      next();
    } catch (err) {
      next(err);
    }
  };
}

/**
 * Blocks a staff member who has not yet chosen their own password.
 *
 * `mustChangePassword` is set when an admin creates an account for someone.
 * Until they change it, the admin who read the generated password off the
 * screen can sign in as them — and a doctor's account can read patient names
 * and reports.
 *
 * Enforced here rather than left to the client. A flag the interface is
 * trusted to honour is a suggestion; anything holding the token can ignore it.
 * The whitelist is deliberately tiny: they can change their password, see who
 * they are, and leave.
 */
const ALLOWED_WHILE_PASSWORD_STALE = [
  { method: 'POST', path: '/api/auth/change-password' },
  { method: 'POST', path: '/api/auth/logout' },
  { method: 'GET', path: '/api/users/me' },
];

export async function requirePasswordChanged(req, res, next) {
  try {
    if (!req.user?.userId) return next();

    const allowed = ALLOWED_WHILE_PASSWORD_STALE.some(
      (entry) => entry.method === req.method && req.originalUrl.split('?')[0] === entry.path
    );
    if (allowed) return next();

    const user = await userRepository.findById(req.user.userId);
    if (!user?.mustChangePassword) return next();

    return next(
      new AppError(
        'Set your own password before continuing.',
        403,
        'PASSWORD_CHANGE_REQUIRED'
      )
    );
  } catch (error) {
    return next(error);
  }
}

export default { isAuthenticated, hasRole, requirePasswordChanged };
