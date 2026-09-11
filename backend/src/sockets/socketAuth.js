// backend/src/sockets/socketAuth.js
//
// Socket.IO authentication and per-room authorisation.
//
// Lives in its own module rather than in socketServer.js because three services
// (bookingService, statusTransitionService, riderAllocationService) import
// socketServer for its emitters. Importing those services back would create a
// cycle. Schemas and tokenUtils import nothing from the socket layer, so they
// are safe to depend on here.
import Booking from '../schemas/Booking.js';
import Rider from '../schemas/Rider.js';
import User from '../schemas/User.js';
import { verifyAccessToken } from '../utils/tokenUtils.js';
import logger from '../utils/logger.js';

/**
 * Extract a bearer token from the handshake.
 * Accepts `auth.token` (the socket.io-client convention) or an Authorization
 * header, with or without the "Bearer " prefix.
 */
export function extractHandshakeToken(handshake = {}) {
  const fromAuth = handshake.auth?.token;
  if (typeof fromAuth === 'string' && fromAuth.trim()) {
    return fromAuth.replace(/^Bearer\s+/i, '').trim();
  }

  const header = handshake.headers?.authorization;
  if (typeof header === 'string' && header.trim()) {
    return header.replace(/^Bearer\s+/i, '').trim();
  }

  return null;
}

/**
 * io.use() middleware. Rejects any connection without a valid access token.
 *
 * Before this existed, any anonymous client could connect and join
 * `booking:<id>` for ANY booking, receiving that patient's diagnostic progress
 * and their phlebotomist's live GPS coordinates.
 */
export function authenticateSocket(socket, next) {
  const token = extractHandshakeToken(socket.handshake);

  if (!token) {
    logger.warn('Socket connection rejected: no access token supplied', {
      socketId: socket.id,
    });
    return next(new Error('UNAUTHORIZED'));
  }

  try {
    const decoded = verifyAccessToken(token);
    socket.data.user = {
      userId: decoded.userId,
      role: decoded.role,
      accountHandle: decoded.accountHandle,
    };
    return next();
  } catch {
    logger.warn('Socket connection rejected: invalid access token', {
      socketId: socket.id,
    });
    return next(new Error('UNAUTHORIZED'));
  }
}

/**
 * May this authenticated user subscribe to this booking's room?
 *
 * Same entitlement model as the REST layer: the patient who owns it, the rider
 * assigned to it, an admin of the booking's own lab centre, or a super admin.
 * Returns a boolean rather than throwing — a socket event has no status code,
 * and we deliberately do not tell the caller whether the booking exists.
 *
 * @returns {Promise<boolean>}
 */
export async function canJoinBookingRoom({ bookingId, user }) {
  if (!bookingId || !user?.userId) {
    return false;
  }

  let booking;
  try {
    booking = await Booking.findById(bookingId).select(
      'patientId assignedRiderId labCenterId'
    );
  } catch {
    // Malformed id — treat exactly like a booking that does not exist.
    return false;
  }

  if (!booking) {
    return false;
  }

  const userId = user.userId.toString();

  if (user.role === 'super_admin') {
    return true;
  }

  if (user.role === 'patient') {
    return Boolean(booking.patientId) && booking.patientId.toString() === userId;
  }

  if (user.role === 'rider') {
    if (!booking.assignedRiderId) {
      return false;
    }
    const rider = await Rider.findOne({ userId }).select('_id');
    return Boolean(rider) && booking.assignedRiderId.toString() === rider._id.toString();
  }

  if (user.role === 'lab_admin') {
    const account = await User.findById(userId).select('labCenterId');
    // Fail closed: an admin bound to no centre is entitled to nothing.
    if (!account?.labCenterId) {
      return false;
    }
    return (
      Boolean(booking.labCenterId) &&
      booking.labCenterId.toString() === account.labCenterId.toString()
    );
  }

  return false;
}

export default { authenticateSocket, canJoinBookingRoom, extractHandshakeToken };
