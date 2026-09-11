// backend/src/processors/riderProcessor.js
import { Booking } from '../schemas/Booking.js';
import { riderAllocationService } from '../services/riderAllocationService.js';
import logger from '../utils/logger.js';

/**
 * Worker processor for asynchronous rider allocation jobs
 */
export async function processRiderAllocationJob(job) {
  const { bookingId, coordinates } = job.data;
  logger.info('Processing rider allocation job', { jobId: job.id, bookingId });

  const booking = await Booking.findById(bookingId);
  if (!booking) {
    logger.warn('Booking not found during rider allocation processing', { bookingId });
    return { success: false, reason: 'BOOKING_NOT_FOUND' };
  }

  if (booking.assignedRiderId || booking.status === 'rider_assigned') {
    logger.info('Booking already has rider assigned', { bookingId, riderId: booking.assignedRiderId });
    return { success: true, alreadyAssigned: true };
  }

  try {
    const claimedRider = await riderAllocationService.allocateRiderForBooking({
      booking,
      coordinates,
    });
    return { success: true, riderId: claimedRider._id };
  } catch (err) {
    logger.error('Rider allocation processor failed for booking', {
      bookingId,
      error: err.message,
    });
    throw err;
  }
}

export default {
  processRiderAllocationJob,
};
