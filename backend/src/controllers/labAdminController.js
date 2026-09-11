// backend/src/controllers/labAdminController.js
import labService from '../services/labService.js';
import { AppError } from '../utils/AppError.js';

/**
 * GET /api/lab/queue
 * Get bookings for the authenticated lab admin's own lab centre
 */
export async function getLabQueue(req, res, next) {
  try {
    const labCenterId = req.user?.labCenterId;
    if (!labCenterId) {
      throw new AppError('No lab centre associated with this admin account', 403, 'FORBIDDEN');
    }

    const { status, page, limit } = req.query;
    const result = await labService.getLabQueue({
      labCenterId,
      status,
      page: page ? Number(page) : 1,
      limit: limit ? Number(limit) : 50,
    });

    return res.status(200).json({
      success: true,
      data: result.bookings,
      pagination: result.pagination,
    });
  } catch (error) {
    next(error);
  }
}

/**
 * PATCH /api/lab/bookings/:id/confirm
 * Confirms lab-visit arrival
 */
export async function confirmArrival(req, res, next) {
  try {
    const labCenterId = req.user?.labCenterId;
    if (!labCenterId) {
      throw new AppError('No lab centre associated with this admin account', 403, 'FORBIDDEN');
    }

    const bookingId = req.params.id;
    const actorUserId = req.user.userId || req.user.id;

    const updatedBooking = await labService.confirmLabArrival({
      bookingId,
      labCenterId,
      actorUserId,
    });

    return res.status(200).json({
      success: true,
      message: 'Lab visit booking confirmed successfully',
      data: updatedBooking,
    });
  } catch (error) {
    next(error);
  }
}

/**
 * POST /api/lab/bookings/:id/cash-received
 * Confirms cash payment received at the lab centre
 */
export async function confirmCash(req, res, next) {
  try {
    const labCenterId = req.user?.labCenterId;
    if (!labCenterId) {
      throw new AppError('No lab centre associated with this admin account', 403, 'FORBIDDEN');
    }

    const bookingId = req.params.id;
    const confirmingUserId = req.user.userId || req.user.id;

    const updatedBooking = await labService.confirmLabCashPayment({
      bookingId,
      labCenterId,
      confirmingUserId,
    });

    return res.status(200).json({
      success: true,
      message: 'Cash payment confirmed at lab centre',
      data: {
        booking: updatedBooking,
        paymentStatus: updatedBooking.paymentStatus,
        confirmedBy: confirmingUserId,
        confirmedAt: new Date(),
      },
    });
  } catch (error) {
    next(error);
  }
}

/**
 * GET /api/lab/profile
 * Get centre accreditation and profile
 */
export async function getProfile(req, res, next) {
  try {
    const labCenterId = req.user?.labCenterId;
    if (!labCenterId) {
      throw new AppError('No lab centre associated with this admin account', 403, 'FORBIDDEN');
    }

    const profile = await labService.getLabProfile({ labCenterId });

    return res.status(200).json({
      success: true,
      data: profile,
    });
  } catch (error) {
    next(error);
  }
}

export default {
  getLabQueue,
  confirmArrival,
  confirmCash,
  getProfile,
};
