import mongoose from 'mongoose';
import { Booking } from '../schemas/Booking.js';
import { paymentRepository } from '../repositories/paymentRepository.js';
import { razorpayClient } from '../utils/razorpayClient.js';
import { BUSINESS_CONFIG } from '../config/businessConfig.js';
import { runInTransaction } from '../utils/transactionHelper.js';
import { AppError } from '../utils/AppError.js';
import logger from '../utils/logger.js';

// A booking may be cancelled only BEFORE the specimen is collected (CONTEXT §5.2).
// 'completed' and 'processing' are legacy Booking.status values retained here so a
// record already carrying one cannot be cancelled either.
const NON_CANCELLABLE_STATUSES = [
  'collected',
  'at_lab',
  'report_ready',
  'processing',
  'completed',
];

export class RefundService {
  /**
   * Cancel a booking and process refund per business rules
   * @param {Object} params
   * @param {string} params.bookingId
   * @param {string} params.userId
   * @param {string} [params.reason]
   * @returns {Promise<Object>}
   */
  async cancelAndRefundBooking({ bookingId, userId, reason }) {
    if (!mongoose.Types.ObjectId.isValid(bookingId)) {
      throw new AppError('Booking not found', 404, 'BOOKING_NOT_FOUND');
    }

    const booking = await Booking.findById(bookingId);

    // Strict 404 on non-existence or unowned record per CONTEXT §3.2
    if (!booking || booking.patientId.toString() !== userId.toString()) {
      throw new AppError('Booking not found', 404, 'BOOKING_NOT_FOUND');
    }

    if (booking.status === 'cancelled') {
      throw new AppError('Booking is already cancelled', 400, 'ALREADY_CANCELLED');
    }

    // Once the specimen is collected the service has been rendered — the sample is
    // in the cold chain and the lab will be billed. CONTEXT §5.2: a booking may be
    // cancelled only BEFORE 'collected'.
    if (NON_CANCELLABLE_STATUSES.includes(booking.status)) {
      throw new AppError('Cannot cancel booking after specimen collection', 400, 'CANNOT_CANCEL');
    }

    const previousPaymentStatus = booking.paymentStatus;

    // Claim the cancellation ATOMICALLY so exactly one concurrent request reaches
    // the gateway. Read-then-write here would let two simultaneous cancellations
    // each issue a refund against the same payment.
    const claimed = await Booking.findOneAndUpdate(
      {
        _id: booking._id,
        patientId: booking.patientId,
        status: { $nin: ['cancelled', ...NON_CANCELLABLE_STATUSES] },
      },
      {
        $set: {
          status: 'cancelled',
          cancelReason: reason || 'Cancelled by user',
        },
      },
      { new: true }
    );

    if (!claimed) {
      const current = await Booking.findById(booking._id);
      if (current && current.status === 'cancelled') {
        throw new AppError('Booking is already cancelled', 400, 'ALREADY_CANCELLED');
      }
      throw new AppError('Cannot cancel booking after specimen collection', 400, 'CANNOT_CANCEL');
    }

    const outcome = await this.executeCancellationRefund({
      booking,
      previousPaymentStatus,
      reason,
    });

    return {
      bookingId: booking._id,
      status: 'cancelled',
      paymentStatus: outcome.paymentStatus,
      amount: booking.amount,
      feeDeducted: outcome.feeDeducted,
      refundAmount: outcome.refundAmount,
      refundStatus: outcome.refundStatus,
    };
  }

  /**
   * Issue the gateway refund for a booking that has ALREADY been moved to
   * 'cancelled' by its caller.
   *
   * Separated so the auto-cancel sweep can reuse it. That processor performs its
   * own atomic status claim (autoCancelProcessor.js:36-48), so it cannot call
   * cancelAndRefundBooking — which would reject the booking as already
   * cancelled and has no userId to check ownership against.
   *
   * Carries NO ownership check: every caller must have established entitlement,
   * or be the system itself.
   *
   * @returns {Promise<{refundAmount:number, feeDeducted:number, refundStatus:string, paymentStatus:string}>}
   */
  async executeCancellationRefund({ booking, previousPaymentStatus, reason }) {
    let refundAmount = 0;
    let feeDeducted = 0;
    let refundStatus = 'none';
    let paymentStatus = previousPaymentStatus;

    // Prepaid UPI cancellation
    if (booking.paymentMode === 'upi' && previousPaymentStatus === 'paid') {
      feeDeducted = BUSINESS_CONFIG.cancellationFee; // ₹20
      const intendedRefund = Math.max(0, booking.amount - feeDeducted);

      const payment = await paymentRepository.findByBookingId(booking._id);

      if (!payment || !payment.gatewayPaymentId) {
        // Nothing was captured at the gateway, so nothing can be returned.
        refundStatus = 'failed';
        if (payment) {
          await paymentRepository.recordRefund({
            bookingId: booking._id,
            refundAmount: 0,
            refundStatus: 'failed',
          });
        }
        logger.error('Cancellation refund could not be issued: no captured gateway payment', {
          bookingId: booking._id.toString(),
          intendedRefund,
          hasPaymentRecord: Boolean(payment),
        });
      } else if (intendedRefund <= 0) {
        refundStatus = 'none';
      } else {
        // Record the attempt BEFORE calling out, so a crash mid-flight leaves a
        // discoverable 'pending' rather than no trace.
        await paymentRepository.recordRefund({
          bookingId: booking._id,
          refundAmount: intendedRefund,
          refundStatus: 'pending',
        });

        try {
          const refund = await razorpayClient.createRefund({
            paymentId: payment.gatewayPaymentId,
            amountPaise: Math.round(intendedRefund * 100),
            notes: {
              bookingId: booking._id.toString(),
              reason: reason || 'Customer requested cancellation',
            },
          });

          // Only now has the money actually been returned.
          refundAmount = intendedRefund;
          refundStatus = intendedRefund === payment.amount ? 'full' : 'partial';
          paymentStatus = 'refunded';

          // The Payment row and the booking flag must agree. The gateway call
          // above is deliberately OUTSIDE this transaction: holding one open
          // across an HTTP request to Razorpay is a long-lived lock that will
          // time out. Intent is recorded before the call, outcome after it, and
          // only the outcome pair is atomic (HIGH H3).
          await runInTransaction(
            async (session) => {
              await paymentRepository.recordRefund({
                bookingId: booking._id,
                refundAmount: intendedRefund,
                refundStatus,
                gatewayRefundId: refund?.id || null,
                session,
              });

              await Booking.updateOne(
                { _id: booking._id },
                { $set: { paymentStatus: 'refunded' } },
                session ? { session } : {}
              );
            },
            { label: 'refund.recordOutcome' }
          );

          logger.info('Cancellation refund confirmed by gateway', {
            bookingId: booking._id.toString(),
            gatewayRefundId: refund?.id || null,
            refundAmount,
          });
        } catch (err) {
          // The gateway refused or was unreachable. The money has NOT moved, so
          // nothing may record or report it as refunded.
          refundAmount = 0;
          refundStatus = 'failed';

          await paymentRepository.recordRefund({
            bookingId: booking._id,
            refundAmount: 0,
            refundStatus: 'failed',
          });

          logger.error('Cancellation refund failed at gateway; manual intervention required', {
            bookingId: booking._id.toString(),
            gatewayPaymentId: payment.gatewayPaymentId,
            intendedRefund,
            error: err.message,
          });
        }
      }
    } else {
      // Cash cancellation: Zero fee (nothing was collected)
      feeDeducted = 0;
      refundAmount = 0;
    }

    return { refundAmount, feeDeducted, refundStatus, paymentStatus };
  }
}

export const refundService = new RefundService();
export default refundService;
