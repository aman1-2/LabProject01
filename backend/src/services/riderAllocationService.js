// backend/src/services/riderAllocationService.js
import { BUSINESS_CONFIG } from '../config/businessConfig.js';
import { redisGeoHelper } from '../utils/redisGeoHelper.js';
import { riderRepository } from '../repositories/riderRepository.js';
import { opsAlertService } from './opsAlertService.js';
import { LabCenter } from '../schemas/LabCenter.js';
import { AppError } from '../utils/AppError.js';
import { emitBookingStatusUpdate } from '../sockets/socketServer.js';
import { enqueuePushNotification } from '../producers/notificationProducer.js';
import logger from '../utils/logger.js';

export class RiderAllocationService {
  /**
   * Allocate a rider to a booking using nearest-first atomic claiming with radius expansion.
   *
   * Algorithm per CONTEXT §6.1 & prompt:
   * 1. Redis GEOSEARCH from booking location, initial radius from config (5km).
   * 2. For each candidate nearest-first: attempt an ATOMIC findOneAndUpdate claim.
   * 3. If claim fails, FALL THROUGH to next candidate (mandatory).
   * 4. If no candidate in radius, double it up to configured max (5km -> 10km -> 20km).
   * 5. If still none, surface it to ops — never fail silently.
   *
   * @param {Object} params
   * @param {Object} params.booking - Booking Mongoose document
   * @param {Object} [params.session] - MongoDB ClientSession for transaction
   * @param {Object} [params.coordinates] - { lat, lng } of booking
   * @returns {Promise<Object>} The atomically claimed Rider document
   */
  async allocateRiderForBooking({ booking, session = null, coordinates = null }) {
    const initialRadius = BUSINESS_CONFIG.riderSearchRadiusKm || 5;
    const maxRadius = BUSINESS_CONFIG.maxRiderSearchRadiusKm || 20;

    const labCenterId = booking.labCenterId?._id || booking.labCenterId;

    // Resolve lat/lng from parameters, booking, or lab center
    let lat = coordinates?.lat;
    let lng = coordinates?.lng;

    if (!lat || !lng) {
      if (booking.location?.coordinates) {
        [lng, lat] = booking.location.coordinates;
      } else if (booking.coordinates) {
        [lng, lat] = booking.coordinates;
      } else if (booking.lat && booking.lng) {
        lat = Number(booking.lat);
        lng = Number(booking.lng);
      } else {
        // Fallback to lab center coordinates
        const lab = await LabCenter.findById(labCenterId);
        if (lab?.geo?.coordinates) {
          [lng, lat] = lab.geo.coordinates;
        } else {
          // No coordinates anywhere. Previously this fell back to Bangalore —
          // a different city from the Dehradun-only launch (§2.5) — and then
          // searched for riders that could never be nearby. Bookings now carry
          // a snapshotted collection address, so reaching here means the data
          // is wrong; say so rather than silently dispatching to a wrong city.
          throw new AppError(
            'Cannot dispatch a rider: this booking has no collection coordinates',
            422,
            'MISSING_COLLECTION_COORDINATES'
          );
        }
      }
    }

    let currentRadius = initialRadius;
    let claimedRider = null;
    let totalCandidatesChecked = 0;

    logger.info('Starting rider allocation search', {
      bookingId: booking._id?.toString(),
      labCenterId: labCenterId?.toString(),
      lat,
      lng,
      initialRadius,
      maxRadius,
    });

    while (currentRadius <= maxRadius) {
      // 1. Redis GEOSEARCH nearest-first
      const candidates = await redisGeoHelper.findNearbyRiders({
        labCenterId,
        lat,
        lng,
        radiusKm: currentRadius,
      });

      logger.debug('Found candidate riders in radius', {
        radiusKm: currentRadius,
        count: candidates.length,
      });

      // 2. Nearest-first atomic claim loop with mandatory fall-through
      for (const candidate of candidates) {
        totalCandidatesChecked++;
        const claimed = await riderRepository.claimRiderAtomic({
          riderId: candidate.riderId,
          bookingId: booking._id,
          session,
        });

        if (claimed) {
          claimedRider = claimed;
          logger.info('Successfully claimed rider atomically', {
            bookingId: booking._id?.toString(),
            riderId: claimed._id?.toString(),
            distanceKm: candidate.distanceKm,
          });
          break;
        }

        // Lost race to a concurrent booking -> FALL THROUGH to next candidate (MANDATORY per CONTEXT §6.1)
        logger.warn('Rider candidate already claimed by another booking, falling through to next', {
          candidateId: candidate.riderId,
          bookingId: booking._id?.toString(),
        });
      }

      if (claimedRider) {
        break;
      }

      // 4. If no candidate claimed in current radius, double it up to max
      currentRadius = currentRadius * 2;
    }

    // 5. If still none claimed, surface to ops — never fail silently
    if (!claimedRider) {
      await opsAlertService.surfaceUnassignedBooking({
        bookingId: booking._id,
        labCenterId,
        searchRadiusKm: Math.min(currentRadius, maxRadius),
        reason: `No available phlebotomists found within ${maxRadius}km radius (checked ${totalCandidatesChecked} candidates)`,
      });

      throw new AppError(
        'No available phlebotomist in your area at this time',
        422,
        'NO_RIDERS_AVAILABLE'
      );
    }

    // Update booking fields
    booking.assignedRiderId = claimedRider._id;
    booking.status = 'rider_assigned';
    if (typeof booking.save === 'function') {
      await booking.save({ session });
    }

    emitBookingStatusUpdate(booking._id, {
      bookingId: booking._id.toString(),
      previousStatus: 'pending',
      status: 'rider_assigned',
      mode: booking.mode,
      assignedRiderId: claimedRider._id,
    });

    // Tell the phlebotomist they have a job. Enqueued, never awaited: a push
    // that fails must not fail the dispatch (CONTEXT §10).
    if (claimedRider.userId) {
      const riderUserId = claimedRider.userId._id || claimedRider.userId;
      enqueuePushNotification({
        userId: riderUserId,
        title: 'New collection assigned',
        body: 'A home collection has been assigned to you. Open PathCare Rider for details.',
        data: { type: 'JOB_ASSIGNED', bookingId: booking._id.toString() },
      }).catch((err) =>
        logger.warn('Could not enqueue assignment push', { error: err.message })
      );
    }

    return claimedRider;
  }

  /**
   * Release a rider back to available status and return to Redis geo pool
   */
  async releaseRider({ riderId, session = null }) {
    if (!riderId) return null;

    const rider = await riderRepository.releaseRider({ riderId, session });
    if (rider && rider.labCenterId) {
      const [lng, lat] = rider.currentLocation?.coordinates || [77.5946, 12.9716];
      const labCenterId = rider.labCenterId._id || rider.labCenterId;
      await redisGeoHelper.addRiderLocation({
        labCenterId,
        riderId: rider._id,
        lat,
        lng,
      });
      logger.info('Rider released back to available status and Redis geo pool', {
        riderId: rider._id.toString(),
        labCenterId: labCenterId.toString(),
      });
    }
    return rider;
  }
}

export const riderAllocationService = new RiderAllocationService();
export default riderAllocationService;
