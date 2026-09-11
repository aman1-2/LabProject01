// backend/src/controllers/riderController.js
import { redisGeoHelper } from '../utils/redisGeoHelper.js';
import { riderRepository } from '../repositories/riderRepository.js';
import { Booking } from '../schemas/Booking.js';
import { AppError } from '../utils/AppError.js';
import { BUSINESS_CONFIG } from '../config/businessConfig.js';
import { emitRiderLocation } from '../sockets/socketServer.js';
import { sampleService } from '../services/sampleService.js';
import { paymentService } from '../services/paymentService.js';
import { sampleCollectSchema, cashReceivedSchema, sampleSubmittedSchema } from '@pathcare/validators';


/**
 * Throttled location update to Redis (NOT written to Mongo per prompt requirements)
 * PATCH /api/rider/location
 */
export async function updateLocation(req, res, next) {
  try {
    const userId = req.user?.userId || req.user?.id;
    const { lat, lng } = req.body;

    if (lat === undefined || lng === undefined || isNaN(Number(lat)) || isNaN(Number(lng))) {
      throw new AppError('Valid lat and lng are required', 400, 'INVALID_COORDINATES');
    }

    const latitude = Number(lat);
    const longitude = Number(lng);

    if (latitude < -90 || latitude > 90 || longitude < -180 || longitude > 180) {
      throw new AppError('Latitude must be between -90 and 90, longitude between -180 and 180', 400, 'COORDINATES_OUT_OF_BOUNDS');
    }

    const rider = await riderRepository.findByUserId(userId);
    if (!rider) {
      throw new AppError('Rider profile not found for authenticated user', 404, 'RIDER_NOT_FOUND');
    }

    // Rate limiting: 1 update per 10 seconds via Redis SET EX NX
    const throttleSec = BUSINESS_CONFIG.riderLocationThrottleSeconds || 10;
    const isAllowed = await redisGeoHelper.checkAndSetLocationThrottle(rider._id, throttleSec);

    if (!isAllowed) {
      throw new AppError(
        `Location updates are throttled. Please wait at most ${throttleSec} seconds between updates.`,
        429,
        'LOCATION_UPDATE_THROTTLED'
      );
    }

    // Add to Redis geo set per lab centre: riders:geo:${labCenterId}
    // CRITICAL: NOT written to Mongo per prompt instructions!
    await redisGeoHelper.addRiderLocation({
      labCenterId: rider.labCenterId._id || rider.labCenterId,
      riderId: rider._id,
      lat: latitude,
      lng: longitude,
    });

    // Emit RIDER_LOCATION on each rider ping, into that booking's room only (CONTEXT §6.3 & prompt)
    if (rider.currentBookingId) {
      emitRiderLocation(rider.currentBookingId, {
        bookingId: rider.currentBookingId.toString(),
        riderId: rider._id.toString(),
        lat: latitude,
        lng: longitude,
      });
    }

    return res.status(200).json({
      success: true,
      message: 'Rider location updated in Redis geo index',
      data: {
        riderId: rider._id,
        labCenterId: rider.labCenterId._id || rider.labCenterId,
        coordinates: [longitude, latitude],
      },
    });
  } catch (error) {
    next(error);
  }
}

/**
 * Get jobs for authenticated rider
 * GET /api/rider/jobs
 */
export async function getJobs(req, res, next) {
  try {
    const userId = req.user?.userId || req.user?.id;
    const rider = await riderRepository.findByUserId(userId);
    if (!rider) {
      throw new AppError('Rider profile not found for authenticated user', 404, 'RIDER_NOT_FOUND');
    }

    let activeJob = null;
    if (rider.currentBookingId) {
      // collectionAddress is a snapshot on the booking, so it needs no populate.
      activeJob = await Booking.findById(rider.currentBookingId)
        .populate('patientId', 'name phone')
        .populate('testIds', 'name slug code')
        .populate('packageIds', 'name slug code')
        .populate('labCenterId', 'name address geo');
    }

    // Unclaimed jobs are visible to EVERY rider at the centre, so they must not
    // carry patient identity. This previously populated patientId with 'name
    // phone', publishing the name and phone number of every patient with a
    // pending booking to riders who had not taken — and might never take — the
    // job. Identity is revealed on claim, via activeJob above.
    const availableJobs = await Booking.find({
      labCenterId: rider.labCenterId._id || rider.labCenterId,
      status: 'pending',
      assignedRiderId: null,
      mode: 'home',
    })
      .select('_id slotDateTime amount paymentMode mode createdAt testIds packageIds collectionAddress.pincode collectionAddress.label')
      .populate('testIds', 'name slug code')
      .populate('packageIds', 'name slug code')
      .sort({ createdAt: -1 })
      .limit(20);

    return res.status(200).json({
      success: true,
      data: {
        rider: {
          id: rider._id,
          status: rider.status,
          currentBookingId: rider.currentBookingId,
        },
        activeJob,
        availableJobs,
      },
    });
  } catch (error) {
    next(error);
  }
}

/**
 * Accept a job atomically (409 if taken by another rider)
 * PATCH /api/rider/jobs/:id/accept
 */
export async function acceptJob(req, res, next) {
  try {
    const userId = req.user?.userId || req.user?.id;
    const bookingId = req.params.id;

    const rider = await riderRepository.findByUserId(userId);
    if (!rider) {
      throw new AppError('Rider profile not found for authenticated user', 404, 'RIDER_NOT_FOUND');
    }

    // 1. Claim the RIDER atomically FIRST.
    //
    //    This was a read-modify-write: the rider was read, checked for an
    //    existing job, and saved at the end. Two concurrent accepts by the same
    //    rider both passed the check, each claimed a DIFFERENT booking, and the
    //    last save won — leaving one rider assigned to two jobs, and one booking
    //    pointing at a rider whose currentBookingId was elsewhere. That orphan
    //    is invisible to every sweep. The atomic pattern already existed in
    //    riderRepository.claimRiderAtomic and simply was not used here.
    const claimedRider = await riderRepository.claimRiderAtomic({
      riderId: rider._id,
      bookingId,
    });

    if (!claimedRider) {
      throw new AppError('Rider already has an active assigned job', 400, 'RIDER_ALREADY_ASSIGNED');
    }

    // 2. Claim the BOOKING atomically: it must still be pending and unassigned.
    const claimedBooking = await Booking.findOneAndUpdate(
      {
        _id: bookingId,
        status: 'pending',
        assignedRiderId: null,
      },
      {
        $set: {
          status: 'rider_assigned',
          assignedRiderId: rider._id,
        },
      },
      { new: true }
    );

    if (!claimedBooking) {
      // The rider was claimed but the job was not; hand them back to the pool
      // rather than stranding them as permanently 'assigned'.
      await riderRepository.releaseRider({ riderId: rider._id });

      const existing = await Booking.findById(bookingId);
      if (!existing) {
        throw new AppError('Booking not found', 404, 'BOOKING_NOT_FOUND');
      }
      // Taken by another rider or status changed -> 409 Conflict
      throw new AppError('This job has already been taken by another phlebotomist', 409, 'JOB_ALREADY_TAKEN');
    }

    return res.status(200).json({
      success: true,
      message: 'Job accepted successfully',
      data: {
        booking: claimedBooking,
      },
    });
  } catch (error) {
    next(error);
  }
}

/**
 * Update rider operational status ('available' | 'offline')
 * PATCH /api/rider/status
 */
export async function updateStatus(req, res, next) {
  try {
    const userId = req.user?.userId || req.user?.id;
    const { status } = req.body;

    if (!['available', 'offline'].includes(status)) {
      throw new AppError("Status must be either 'available' or 'offline'", 400, 'INVALID_STATUS');
    }

    const rider = await riderRepository.findByUserId(userId);
    if (!rider) {
      throw new AppError('Rider profile not found for authenticated user', 404, 'RIDER_NOT_FOUND');
    }

    if (status === 'offline' && rider.status === 'assigned') {
      throw new AppError('Cannot go offline while assigned an active job', 400, 'CANNOT_GO_OFFLINE_WHILE_ASSIGNED');
    }

    rider.status = status;
    await rider.save();

    const labCenterId = rider.labCenterId._id || rider.labCenterId;
    if (status === 'offline') {
      await redisGeoHelper.removeRiderLocation({ labCenterId, riderId: rider._id });
    }

    return res.status(200).json({
      success: true,
      message: `Rider status updated to ${status}`,
      data: {
        status: rider.status,
      },
    });
  } catch (error) {
    next(error);
  }
}

/**
 * Phlebotomist collects sample, generates deterministic barcode, logs first cold-chain reading, transitions booking
 * POST /api/rider/jobs/:id/collect
 */
export async function collectJob(req, res, next) {
  try {
    const bookingId = req.params.id;
    const userId = req.user?.userId || req.user?.id;
    const userRole = req.user?.role;

    const validated = sampleCollectSchema.parse(req.body || {});

    const result = await sampleService.collectSample({
      bookingId,
      riderUserId: userId,
      userRole,
      temperature: validated.temperature,
      notes: validated.notes,
    });

    return res.status(201).json({
      success: true,
      message: 'Sample collected successfully and barcode generated',
      data: result,
    });
  } catch (error) {
    next(error);
  }
}

/**
 * Confirm cash payment received by rider
 * POST /api/rider/jobs/:id/cash-received
 */
export async function confirmCashReceived(req, res, next) {
  try {
    const bookingId = req.params.id;
    const userId = req.user?.userId || req.user?.id;
    const userRole = req.user?.role;

    cashReceivedSchema.parse(req.body || {});

    // Check rider assignment ownership (404 on unowned per CONTEXT §3.2)
    if (userRole !== 'super_admin') {
      const rider = await riderRepository.findByUserId(userId);
      if (!rider) {
        throw new AppError('Rider profile not found', 404, 'RIDER_NOT_FOUND');
      }

      const booking = await Booking.findById(bookingId);
      if (!booking || !booking.assignedRiderId || booking.assignedRiderId.toString() !== rider._id.toString()) {
        throw new AppError('Booking not found', 404, 'BOOKING_NOT_FOUND');
      }
    }

    const updatedBooking = await paymentService.confirmCashPayment({
      bookingId,
      confirmedByUserId: userId,
      actorRole: userRole,
    });

    return res.status(200).json({
      success: true,
      message: 'Cash payment confirmed successfully',
      data: {
        booking: updatedBooking,
        paymentStatus: updatedBooking.paymentStatus,
        confirmedBy: userId,
        confirmedAt: new Date(),
      },
    });
  } catch (error) {
    next(error);
  }
}

/**
 * Phlebotomist marks handoff at the laboratory
 * POST /api/rider/jobs/:id/submitted
 */
export async function submitJobAtLab(req, res, next) {
  try {
    const bookingId = req.params.id;
    const userId = req.user?.userId || req.user?.id;
    const userRole = req.user?.role;

    const validated = sampleSubmittedSchema.parse(req.body || {});

    const result = await sampleService.submitSampleAtLab({
      bookingId,
      riderUserId: userId,
      userRole,
      temperature: validated.temperature,
      notes: validated.notes,
    });

    return res.status(200).json({
      success: true,
      message: 'Sample submitted at lab successfully',
      data: result,
    });
  } catch (error) {
    next(error);
  }
}

export default {
  updateLocation,
  getJobs,
  acceptJob,
  updateStatus,
  collectJob,
  confirmCashReceived,
  submitJobAtLab,
};

