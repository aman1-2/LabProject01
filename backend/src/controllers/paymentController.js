import paymentService from '../services/paymentService.js';
import refundService from '../services/refundService.js';
import AppError from '../utils/AppError.js';

export async function createOrder(req, res, next) {
  try {
    const { bookingId } = req.body;
    if (!bookingId) {
      throw new AppError('bookingId is required to create a payment order', 400, 'MISSING_BOOKING_ID');
    }

    const userId = req.user.userId || req.user.id;
    const order = await paymentService.createRazorpayOrder({
      bookingId,
      userId,
    });

    res.status(200).json({
      success: true,
      data: order,
    });
  } catch (error) {
    next(error);
  }
}

export async function confirmCash(req, res, next) {
  try {
    const { bookingId } = req.params;
    const confirmedByUserId = req.user.userId || req.user.id;

    const booking = await paymentService.confirmCashPayment({
      bookingId,
      confirmedByUserId,
      actorRole: req.user?.role,
      // Populated from the database by hasRole() for lab admins.
      actorLabCenterId: req.user?.labCenterId || null,
    });

    res.status(200).json({
      success: true,
      data: booking,
    });
  } catch (error) {
    next(error);
  }
}

export async function cancelBooking(req, res, next) {
  try {
    const { bookingId } = req.params;
    const { reason } = req.body;
    const userId = req.user.userId || req.user.id;

    const result = await refundService.cancelAndRefundBooking({
      bookingId,
      userId,
      reason,
    });

    res.status(200).json({
      success: true,
      data: result,
    });
  } catch (error) {
    next(error);
  }
}

export default {
  createOrder,
  confirmCash,
  cancelBooking,
};
