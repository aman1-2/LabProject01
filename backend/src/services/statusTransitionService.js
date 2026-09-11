// backend/src/services/statusTransitionService.js
import Booking from '../schemas/Booking.js';
import Rider from '../schemas/Rider.js';
import { emitBookingStatusUpdate } from '../sockets/socketServer.js';
import { AppError } from '../utils/AppError.js';
import logger from '../utils/logger.js';

/**
 * Which statuses each role may drive a booking to, once it has been established
 * that the actor is entitled to that specific booking (CONTEXT §3.2).
 * A role absent from this map may not transition bookings at all.
 */
export const ROLE_ALLOWED_TARGET_STATUSES = {
  patient: ['cancelled'],
  rider: ['rider_assigned', 'en_route', 'collected', 'at_lab'],
  lab_admin: ['confirmed', 'collected', 'at_lab', 'report_ready', 'cancelled'],
  super_admin: null, // null = unrestricted; the state machine is the only limit
};

/**
 * Valid state transitions per PATHCARE_CONTEXT.md §5.2
 *
 * Home collection: pending → rider_assigned → en_route → collected → at_lab → report_ready
 * Lab visit: awaiting_confirm → confirmed → collected → at_lab → report_ready
 * Either can go to cancelled before collected.
 */
export const VALID_TRANSITIONS = {
  home: {
    pending: ['rider_assigned', 'cancelled'],
    rider_assigned: ['en_route', 'cancelled'],
    en_route: ['collected', 'cancelled'],
    collected: ['at_lab'],
    at_lab: ['report_ready'],
    report_ready: [],
    cancelled: [],
  },
  visit: {
    awaiting_confirm: ['confirmed', 'cancelled'],
    confirmed: ['collected', 'cancelled'],
    collected: ['at_lab'],
    at_lab: ['report_ready'],
    report_ready: [],
    cancelled: [],
  },
};

export class StatusTransitionService {
  /**
   * Check if a status transition is valid according to the state machine
   */
  isValidTransition(mode, currentStatus, newStatus) {
    const transitionsForMode = VALID_TRANSITIONS[mode];
    if (!transitionsForMode) {
      return false;
    }
    const allowedNext = transitionsForMode[currentStatus] || [];
    return allowedNext.includes(newStatus);
  }

  /**
   * Verify the actor is entitled to transition THIS booking.
   *
   * Every entitlement failure returns 404, never 403: a caller who is not
   * entitled to the booking must not be able to distinguish a real booking from
   * a fabricated id (CONTEXT §3.2). 403 is used only once entitlement is
   * established, to say "this booking, but not this status".
   */
  async assertActorMayTransition({ booking, actor, newStatus }) {
    const actorId = (actor.userId || actor.id || '').toString();
    const role = actor.role;

    const notFound = () =>
      new AppError('Booking not found', 404, 'BOOKING_NOT_FOUND');

    // Unknown or unlisted role (e.g. 'doctor') may not transition anything.
    if (!Object.prototype.hasOwnProperty.call(ROLE_ALLOWED_TARGET_STATUSES, role)) {
      throw notFound();
    }

    // 1. Entitlement to this specific booking.
    if (role === 'patient') {
      if (!booking.patientId || booking.patientId.toString() !== actorId) {
        throw notFound();
      }
    } else if (role === 'rider') {
      if (!booking.assignedRiderId) {
        throw notFound();
      }
      const rider = await Rider.findOne({ userId: actorId }).select('_id');
      if (!rider || booking.assignedRiderId.toString() !== rider._id.toString()) {
        throw notFound();
      }
    } else if (role === 'lab_admin') {
      // Fail closed: an admin with no centre bound is entitled to nothing.
      const actorLabCenterId = actor.labCenterId ? actor.labCenterId.toString() : null;
      if (!actorLabCenterId) {
        throw notFound();
      }
      if (!booking.labCenterId || booking.labCenterId.toString() !== actorLabCenterId) {
        throw notFound();
      }
    }
    // super_admin: entitled to every booking.

    // 2. Is this status within the role's remit? Entitlement is already
    //    established here, so 403 leaks nothing.
    const allowed = ROLE_ALLOWED_TARGET_STATUSES[role];
    if (allowed !== null && !allowed.includes(newStatus)) {
      throw new AppError(
        `A ${role} may not transition a booking to '${newStatus}'`,
        403,
        'FORBIDDEN_TRANSITION'
      );
    }
  }

  /**
   * Transition a booking's status, validating state machine and emitting real-time event
   */
  async transitionBookingStatus({ bookingId, newStatus, actor = null, metadata = {}, session = null }) {
    const booking = await Booking.findById(bookingId).session(session);
    if (!booking) {
      throw new AppError('Booking not found', 404, 'BOOKING_NOT_FOUND');
    }

    const previousStatus = booking.status;
    const mode = booking.mode || 'home';

    // 1. AUTHORISE FIRST. Validating the state machine ahead of entitlement
    //    turned this endpoint into a status oracle: a 400 naming the current
    //    status confirmed a booking existed, a 404 proved it did not.
    //    An actor of null means an internal caller that has already authorised.
    if (actor) {
      await this.assertActorMayTransition({ booking, actor, newStatus });
    }

    // 2. Enforce State Machine (CONTEXT §5.2)
    if (!this.isValidTransition(mode, previousStatus, newStatus)) {
      logger.warn('Invalid status transition attempt rejected', {
        bookingId: booking._id.toString(),
        mode,
        previousStatus,
        newStatus,
      });
      throw new AppError(
        `Invalid status transition from '${previousStatus}' to '${newStatus}' for ${mode} collection.`,
        400,
        'INVALID_STATUS_TRANSITION'
      );
    }

    // 3. Apply the change ATOMICALLY, conditional on the status we validated
    //    against.
    //
    //    This was read-modify-write: the booking was read, the state machine
    //    checked, then `booking.save()` wrote the whole document. Two concurrent
    //    transitions from the same status both validated and both saved, and the
    //    last write won. Concurrent 'cancelled' and 'collected' from 'en_route'
    //    could leave a booking cancelled — and refunded — after the sample had
    //    already been drawn. Putting previousStatus in the filter means exactly
    //    one of them commits.
    const updates = { status: newStatus };

    if (newStatus === 'collected' && metadata.barcode) {
      updates.barcode = metadata.barcode;
    }

    if (newStatus === 'cancelled' && metadata.reason) {
      updates.cancelReason = metadata.reason;
    }

    const updatedBooking = await Booking.findOneAndUpdate(
      { _id: booking._id, status: previousStatus },
      { $set: updates },
      { new: true, ...(session ? { session } : {}) }
    );

    if (!updatedBooking) {
      // Someone else moved this booking between our read and our write.
      const current = await Booking.findById(booking._id).select('status').session(session);
      logger.warn('Status transition lost a concurrent race', {
        bookingId: booking._id.toString(),
        expectedStatus: previousStatus,
        actualStatus: current?.status,
        attemptedStatus: newStatus,
      });
      throw new AppError(
        'This booking was updated by someone else. Please refresh and try again.',
        409,
        'STATUS_TRANSITION_CONFLICT'
      );
    }

    logger.info('Booking status transitioned successfully', {
      bookingId: booking._id.toString(),
      previousStatus,
      newStatus,
    });

    // 4. Emit BOOKING_STATUS_UPDATED into room `booking:<id>` per CONTEXT §6.3.
    //    Read from the committed document, not the pre-update copy.
    emitBookingStatusUpdate(updatedBooking._id, {
      bookingId: updatedBooking._id.toString(),
      previousStatus,
      status: newStatus,
      mode: updatedBooking.mode,
      assignedRiderId: updatedBooking.assignedRiderId,
      barcode: updatedBooking.barcode || null,
      metadata,
    });

    return updatedBooking;
  }
}

export const statusTransitionService = new StatusTransitionService();
export default statusTransitionService;
