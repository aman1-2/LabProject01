import { bookingService } from '../services/bookingService.js';
import { createBookingSchema , rescheduleBookingSchema, cancelBookingSchema } from '@pathcare/validators';
import { AppError } from '../utils/AppError.js';

export async function createBooking(req, res, next) {
  try {
    const idempotencyKey = req.headers['idempotency-key'] || req.headers['x-idempotency-key'];

    if (!idempotencyKey || typeof idempotencyKey !== 'string' || !idempotencyKey.trim()) {
      throw new AppError('Idempotency-Key header is required', 400, 'MISSING_IDEMPOTENCY_KEY');
    }

    // Validate payload against schema
    const validatedData = createBookingSchema.parse(req.body);

    const patientId = req.user.userId || req.user.id;

    const result = await bookingService.createBooking({
      patientId,
      idempotencyKey: idempotencyKey.trim(),
      bookingData: validatedData,
    });

    res.status(201).json({
      success: true,
      data: result.booking,
      isReplay: result.isReplay,
    });
  } catch (error) {
    next(error);
  }
}

export async function listBookings(req, res, next) {
  try {
    const patientId = req.user.userId || req.user.id;
    const page = parseInt(req.query.page, 10) || 1;
    const limit = parseInt(req.query.limit, 10) || 50;
    const skip = (page - 1) * limit;

    const bookings = await bookingService.getPatientBookings(patientId, {
      skip,
      limit,
    });

    res.status(200).json({
      success: true,
      data: bookings,
    });
  } catch (error) {
    next(error);
  }
}

export async function getBookingById(req, res, next) {
  try {
    const patientId = req.user.userId || req.user.id;
    const { id } = req.params;
    const booking = await bookingService.getBookingDetails(id, patientId);

    res.status(200).json({
      success: true,
      data: booking,
    });
  } catch (error) {
    next(error);
  }
}

import { statusTransitionService } from '../services/statusTransitionService.js';

export async function updateBookingStatus(req, res, next) {
  try {
    const { id } = req.params;
    const { status, barcode, reason } = req.body;

    if (!status) {
      throw new AppError('Status is required', 400, 'MISSING_STATUS');
    }

    const actor = {
      id: req.user.userId || req.user.id,
      userId: req.user.userId || req.user.id,
      role: req.user.role,
      // Populated from the database by hasRole() for lab admins; the service
      // requires it and treats its absence as "entitled to nothing".
      labCenterId: req.user.labCenterId || null,
    };

    const updated = await statusTransitionService.transitionBookingStatus({
      bookingId: id,
      newStatus: status,
      actor,
      metadata: { barcode, reason },
    });

    res.status(200).json({
      success: true,
      message: `Booking status updated to ${status}`,
      data: updated,
    });
  } catch (error) {
    next(error);
  }
}

export async function rescheduleBooking(req, res, next) {
  try {
    const patientId = req.user.userId || req.user.id;
    const { id } = req.params;
    const validatedData = rescheduleBookingSchema.parse(req.body);

    const booking = await bookingService.rescheduleBooking({
      bookingId: id,
      patientId,
      slotDateTime: validatedData.slotDateTime,
    });

    res.status(200).json({
      success: true,
      message: 'Booking rescheduled successfully',
      data: booking,
    });
  } catch (error) {
    next(error);
  }
}

export async function cancelBooking(req, res, next) {
  try {
    const patientId = req.user.userId || req.user.id;
    const { id } = req.params;
    const validatedData = cancelBookingSchema.parse(req.body);

    const result = await bookingService.cancelBooking({
      bookingId: id,
      patientId,
      reason: validatedData.reason,
    });

    res.status(200).json({
      success: true,
      message: 'Booking cancelled successfully',
      data: result.booking,
      refundAmount: result.refundAmount,
      cancellationFee: result.cancellationFee,
      // 'full' | 'partial' = confirmed by the gateway. 'failed' = money has NOT
      // been returned; the UI must not tell the patient they were refunded.
      refundStatus: result.refundStatus,
    });
  } catch (error) {
    next(error);
  }
}

export default {
  createBooking,
  listBookings,
  getBookingById,
  updateBookingStatus,
  rescheduleBooking,
  cancelBooking,
};

