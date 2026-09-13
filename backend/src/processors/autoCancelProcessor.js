import Booking from '../schemas/Booking.js';
import refundService from '../services/refundService.js';
import { emitBookingStatusUpdate } from '../sockets/socketServer.js';
import logger from '../utils/logger.js';

/**
 * Repeatable job processor that auto-cancels unconfirmed lab-visit bookings
 * 8 hours past their scheduled slot (config-driven).
 * 
 * MUST BE STRICTLY IDEMPOTENT:
 * Even if the job runs concurrently or repeatedly, each booking is cancelled
 * exactly once due to atomic conditional matching on status: 'awaiting_confirm'.
 */
export async function processAutoCancelJob(job = {}) {
  const now = new Date();
  logger.info('Running autoCancel sweep for expired unconfirmed lab-visit bookings', {
    jobId: job?.id,
    timestamp: now.toISOString(),
  });

  // Query candidate bookings that are overdue for auto-cancellation
  const candidates = await Booking.find({
    mode: 'visit',
    status: 'awaiting_confirm',
    autoCancelAt: { $lte: now },
  }).lean();

  let cancelledCount = 0;
  let refundedCount = 0;
  const cancelledIds = [];

  for (const candidate of candidates) {
    // ATOMIC CONDITIONAL UPDATE:
    // Ensures idempotency. If already cancelled or confirmed by another process or run,
    // findOneAndUpdate will match 0 documents and return null.
    const updated = await Booking.findOneAndUpdate(
      {
        _id: candidate._id,
        status: 'awaiting_confirm',
      },
      {
        $set: {
          status: 'cancelled',
          cancelReason: 'Auto-cancelled: lab-visit unconfirmed 8 hours past scheduled slot',
        },
      },
      { new: true }
    );

    if (updated) {
      cancelledCount++;
      cancelledIds.push(updated._id.toString());

      // If booking was already paid (e.g. online UPI), process cancellation refund.
      // The atomic claim above guarantees exactly one sweep reaches this point for
      // a given booking, so the refund is issued at most once.
      if (updated.paymentStatus === 'paid') {
        try {
          const outcome = await refundService.executeCancellationRefund({
            booking: updated,
            previousPaymentStatus: 'paid',
            reason: 'Auto-cancelled: lab visit unconfirmed past the confirmation window',
          });

          refundedCount += outcome.refundStatus === 'full' || outcome.refundStatus === 'partial' ? 1 : 0;

          if (outcome.refundStatus === 'failed') {
            logger.error('AutoCancel refund did not complete; manual intervention required', {
              bookingId: updated._id.toString(),
              amount: updated.amount,
            });
          }
        } catch (refundErr) {
          logger.error('Failed to process refund during autoCancel', {
            bookingId: updated._id.toString(),
            error: refundErr.message,
          });
        }
      }

      // Real-time notification to patient via Socket.IO
      try {
        emitBookingStatusUpdate(updated._id.toString(), {
          status: 'cancelled',
          cancelReason: updated.cancelReason,
          mode: updated.mode,
        });
      } catch (socketErr) {
        logger.debug('Socket emit skipped during autoCancel', { error: socketErr.message });
      }

      logger.info('Booking auto-cancelled successfully', {
        bookingId: updated._id.toString(),
        slotDateTime: updated.slotDateTime,
        autoCancelAt: updated.autoCancelAt,
      });
    }
  }

  logger.info('AutoCancel sweep finished', {
    candidatesFound: candidates.length,
    cancelledCount,
    refundedCount,
    cancelledIds,
  });

  return {
    candidatesFound: candidates.length,
    cancelledCount,
    refundedCount,
    cancelledIds,
  };
}

export default { processAutoCancelJob };
