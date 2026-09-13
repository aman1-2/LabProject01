import mongoose from 'mongoose';
import { sampleRepository } from '../repositories/sampleRepository.js';
import { riderRepository } from '../repositories/riderRepository.js';
import { Booking } from '../schemas/Booking.js';
import { Rider } from '../schemas/Rider.js';
import { statusTransitionService } from './statusTransitionService.js';
import { generateDeterministicBarcode } from '../utils/barcodeGenerator.js';
import { AppError } from '../utils/AppError.js';
import logger from '../utils/logger.js';

export class SampleService {
  /**
   * Phlebotomist collects physical sample from patient
   * POST /api/rider/jobs/:id/collect
   *
   * @param {Object} params
   * @param {string} params.bookingId
   * @param {string} params.riderUserId - Authenticated user ID
   * @param {string} [params.userRole] - 'rider' | 'super_admin'
   * @param {number} [params.temperature=4.0]
   * @param {string} [params.notes]
   * @returns {Promise<{ sample: Object, booking: Object }>}
   */
  async collectSample({ bookingId, riderUserId, userRole = 'rider', temperature = 4.0, notes = '' }) {
    if (!mongoose.Types.ObjectId.isValid(bookingId)) {
      throw new AppError('Booking not found', 404, 'BOOKING_NOT_FOUND');
    }

    const booking = await Booking.findById(bookingId);
    if (!booking) {
      throw new AppError('Booking not found', 404, 'BOOKING_NOT_FOUND');
    }

    // Check rider profile and verify ownership
    let rider = null;
    if (userRole !== 'super_admin') {
      rider = await riderRepository.findByUserId(riderUserId);
      if (!rider) {
        throw new AppError('Rider profile not found', 404, 'RIDER_NOT_FOUND');
      }

      // Return 404 (not 403) for unowned booking per CONTEXT §3.2
      if (!booking.assignedRiderId || booking.assignedRiderId.toString() !== rider._id.toString()) {
        throw new AppError('Booking not found', 404, 'BOOKING_NOT_FOUND');
      }
    }

    // Check if sample already collected
    const existingSample = await sampleRepository.findByBookingId(booking._id);
    if (existingSample || booking.status === 'collected' || booking.status === 'at_lab' || booking.status === 'report_ready') {
      throw new AppError('Sample has already been collected for this booking', 400, 'SAMPLE_ALREADY_COLLECTED');
    }

    // Verify booking mode
    if (booking.mode !== 'home') {
      throw new AppError('Physical rider collection is only valid for home collection bookings', 400, 'INVALID_BOOKING_MODE');
    }

    // Advance to en_route if currently rider_assigned to strictly follow state machine §5.2
    if (booking.status === 'rider_assigned') {
      await statusTransitionService.transitionBookingStatus({
        bookingId: booking._id,
        newStatus: 'en_route',
      });
    }

    // Ensure status is now en_route
    const freshBooking = await Booking.findById(booking._id);
    if (freshBooking.status !== 'en_route') {
      throw new AppError(
        `Cannot collect sample while booking status is '${freshBooking.status}'. Must be 'en_route'.`,
        400,
        'INVALID_STATUS_TRANSITION'
      );
    }

    // Deterministic & collision-safe barcode generation loop
    let sample = null;
    let barcode = null;
    let attempt = 0;
    const maxAttempts = 5;

    const tempReading = Number(temperature ?? 4.0);

    while (attempt < maxAttempts) {
      barcode = generateDeterministicBarcode(freshBooking._id, { date: new Date(), attempt });
      try {
        sample = await sampleRepository.createSample({
          bookingId: freshBooking._id,
          barcode,
          collectedAt: new Date(),
          coldChainLog: [
            {
              temperature: tempReading,
              recordedAt: new Date(),
              recordedBy: riderUserId,
              notes: notes || 'Sample collected and placed in temperature-controlled transport box',
            },
          ],
          handoffTimestamps: {
            collectedAt: new Date(),
          },
        });
        break; // Successfully persisted
      } catch (err) {
        // Handle MongoDB unique index collision on barcode (code 11000)
        if (err.code === 11000 && (err.keyPattern?.barcode || (err.message && err.message.includes('barcode')))) {
          attempt++;
          logger.warn('Barcode collision detected on insert; retrying with incremented deterministic salt', {
            bookingId: freshBooking._id.toString(),
            collidedBarcode: barcode,
            attempt,
          });
          continue;
        }
        throw err;
      }
    }

    if (!sample) {
      throw new AppError('Failed to generate a collision-safe barcode after maximum attempts', 500, 'BARCODE_COLLISION_EXHAUSTED');
    }

    // Transition booking status to 'collected' with barcode
    const updatedBooking = await statusTransitionService.transitionBookingStatus({
      bookingId: freshBooking._id,
      newStatus: 'collected',
      metadata: {
        barcode: sample.barcode,
        sampleId: sample._id,
        initialTemperature: tempReading,
      },
    });

    logger.info('Sample collected successfully by rider', {
      bookingId: freshBooking._id.toString(),
      barcode: sample.barcode,
      riderUserId,
    });

    return {
      sample,
      booking: updatedBooking,
    };
  }

  /**
   * Phlebotomist submits collected physical sample to partner lab
   * POST /api/rider/jobs/:id/submitted
   *
   * @param {Object} params
   * @param {string} params.bookingId
   * @param {string} params.riderUserId
   * @param {string} [params.userRole]
   * @param {number} [params.temperature=4.0]
   * @param {string} [params.notes]
   * @returns {Promise<{ sample: Object, booking: Object }>}
   */
  async submitSampleAtLab({ bookingId, riderUserId, userRole = 'rider', temperature = 4.0, notes = '' }) {
    if (!mongoose.Types.ObjectId.isValid(bookingId)) {
      throw new AppError('Booking not found', 404, 'BOOKING_NOT_FOUND');
    }

    const booking = await Booking.findById(bookingId);
    if (!booking) {
      throw new AppError('Booking not found', 404, 'BOOKING_NOT_FOUND');
    }

    let rider = null;
    if (userRole !== 'super_admin') {
      rider = await riderRepository.findByUserId(riderUserId);
      if (!rider) {
        throw new AppError('Rider profile not found', 404, 'RIDER_NOT_FOUND');
      }

      // 404 on unowned resource per CONTEXT §3.2
      if (!booking.assignedRiderId || booking.assignedRiderId.toString() !== rider._id.toString()) {
        throw new AppError('Booking not found', 404, 'BOOKING_NOT_FOUND');
      }
    }

    if (booking.status !== 'collected') {
      throw new AppError(
        `Cannot submit sample at lab when status is '${booking.status}'. Sample must be 'collected' first.`,
        400,
        'INVALID_STATUS_TRANSITION'
      );
    }

    const sample = await sampleRepository.findByBookingId(booking._id);
    if (!sample) {
      throw new AppError('Physical sample record not found for this booking', 404, 'SAMPLE_NOT_FOUND');
    }

    // Append cold-chain handoff reading (never overwrites earlier readings)
    const handoffReading = {
      temperature: Number(temperature ?? 4.0),
      recordedAt: new Date(),
      recordedBy: riderUserId,
      notes: notes || 'Handoff completed at partner lab intake bench',
    };

    const updatedSample = await sampleRepository.updateHandoff({
      bookingId: booking._id,
      timestampKey: 'submittedAt',
      date: new Date(),
      coldChainReading: handoffReading,
    });

    // Also update labReceivedAt timestamp
    await sampleRepository.updateHandoff({
      bookingId: booking._id,
      timestampKey: 'labReceivedAt',
      date: new Date(),
    });

    // Transition booking status: collected -> at_lab
    const updatedBooking = await statusTransitionService.transitionBookingStatus({
      bookingId: booking._id,
      newStatus: 'at_lab',
      metadata: {
        barcode: sample.barcode,
        submittedAt: new Date(),
      },
    });

    // Free rider operational status back to 'available'
    const riderToRelease = rider || (await Rider.findById(booking.assignedRiderId));
    if (riderToRelease) {
      riderToRelease.status = 'available';
      riderToRelease.currentBookingId = null;
      await riderToRelease.save();
    }

    logger.info('Sample submitted at lab successfully', {
      bookingId: booking._id.toString(),
      barcode: sample.barcode,
      riderUserId,
    });

    return {
      sample: updatedSample,
      booking: updatedBooking,
    };
  }

  /**
   * Append a cold chain reading to an existing sample
   * @param {Object} params
   * @param {string} params.bookingId
   * @param {number} params.temperature
   * @param {string} params.recordedBy - userId
   * @param {string} [params.notes]
   * @returns {Promise<Object>}
   */
  async addColdChainReading({ bookingId, temperature, recordedBy, notes = '' }) {
    if (!mongoose.Types.ObjectId.isValid(bookingId)) {
      throw new AppError('Booking not found', 404, 'BOOKING_NOT_FOUND');
    }

    const sample = await sampleRepository.findByBookingId(bookingId);
    if (!sample) {
      throw new AppError('Sample not found', 404, 'SAMPLE_NOT_FOUND');
    }

    const reading = {
      temperature: Number(temperature),
      recordedAt: new Date(),
      recordedBy,
      notes: notes || 'Cold-chain telemetry checkpoint logged',
    };

    return sampleRepository.appendColdChainReading(bookingId, reading);
  }

  /**
   * Get sample details by booking ID with strict ownership validation
   * @param {string} bookingId
   * @param {Object} caller - { userId, role }
   * @returns {Promise<Object>}
   */
  async getSampleByBookingId(bookingId, caller) {
    if (!mongoose.Types.ObjectId.isValid(bookingId)) {
      throw new AppError('Booking not found', 404, 'BOOKING_NOT_FOUND');
    }

    const booking = await Booking.findById(bookingId);
    if (!booking) {
      throw new AppError('Booking not found', 404, 'BOOKING_NOT_FOUND');
    }

    // Caller ownership verification
    const callerId = (caller?.userId || caller?.id || '').toString();
    const isPatientOwner = booking.patientId && booking.patientId.toString() === callerId;
    const isSuperAdmin = caller?.role === 'super_admin';

    let isAssignedRider = false;
    if (caller?.role === 'rider') {
      const rider = await riderRepository.findByUserId(callerId);
      if (rider && booking.assignedRiderId && booking.assignedRiderId.toString() === rider._id.toString()) {
        isAssignedRider = true;
      }
    }

    // 404 for unowned resource per CONTEXT §3.2
    if (!isPatientOwner && !isAssignedRider && !isSuperAdmin) {
      throw new AppError('Booking not found', 404, 'BOOKING_NOT_FOUND');
    }

    const sample = await sampleRepository.findByBookingId(bookingId);
    if (!sample) {
      throw new AppError('Sample not found for this booking', 404, 'SAMPLE_NOT_FOUND');
    }

    return sample;
  }
}

export const sampleService = new SampleService();
export default sampleService;
