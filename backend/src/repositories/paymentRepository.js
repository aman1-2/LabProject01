import { Payment } from '../schemas/Payment.js';

export class PaymentRepository {
  /**
   * Create a new payment record
   * @param {Object} paymentData
   * @returns {Promise<Payment>}
   */
  async createPayment(paymentData) {
    const payment = new Payment(paymentData);
    return payment.save();
  }

  /**
   * Find payment by Razorpay Gateway Order ID
   * @param {string} gatewayOrderId
   * @returns {Promise<Payment|null>}
   */
  async findByGatewayOrderId(gatewayOrderId) {
    return Payment.findOne({ gatewayOrderId });
  }

  /**
   * Find payment by Booking ID
   * @param {string} bookingId
   * @returns {Promise<Payment|null>}
   */
  async findByBookingId(bookingId) {
    return Payment.findOne({ bookingId }).sort({ createdAt: -1 });
  }

  /**
   * Check if a webhook event ID has already been processed (Deduplication per CONTEXT §3.3 & §6.2)
   * @param {string} eventId
   * @returns {Promise<boolean>}
   */
  async hasProcessedEvent(eventId) {
    if (!eventId) return false;
    const exists = await Payment.exists({ webhookEventIds: eventId });
    return !!exists;
  }

  /**
   * Record payment capture and add event ID atomically
   * @param {Object} params
   * @param {string} params.gatewayOrderId
   * @param {string} params.gatewayPaymentId
   * @param {string} params.eventId
   * @param {number} [params.amount]
   * @returns {Promise<Payment|null>}
   */
  async recordCapturedPayment({ gatewayOrderId, gatewayPaymentId, eventId, amount, session = null }) {
    const update = {
      $set: {
        status: 'captured',
        gatewayPaymentId,
        ...(amount ? { amount } : {}),
      },
    };

    const filter = { gatewayOrderId };

    if (eventId) {
      update.$addToSet = { webhookEventIds: eventId };
      // Atomic dedup: the event id must not already be recorded on this
      // payment. Two concurrent deliveries of the same event both pass an
      // earlier `hasProcessedEvent` check, but only one can match this filter,
      // so the side effects run exactly once. Returns null for the loser.
      filter.webhookEventIds = { $ne: eventId };
    }

    return Payment.findOneAndUpdate(filter, update, { new: true, ...(session ? { session } : {}) });
  }

  /**
   * Record refund state on a payment.
   *
   * The payment is marked 'refunded' ONLY for a gateway-confirmed refund
   * ('full' or 'partial'). A 'pending' or 'failed' refundStatus leaves
   * payment.status untouched — money that has not moved must never be
   * recorded as returned.
   *
   * @param {Object} params
   * @param {string} params.bookingId
   * @param {number} params.refundAmount
   * @param {'none'|'pending'|'failed'|'partial'|'full'} params.refundStatus
   * @param {string} [params.gatewayRefundId] - Razorpay refund id, when confirmed
   * @returns {Promise<Payment|null>}
   */
  async recordRefund({ bookingId, refundAmount, refundStatus, gatewayRefundId = null, session = null }) {
    const isConfirmed = refundStatus === 'full' || refundStatus === 'partial';

    const update = {
      refundStatus,
      refundAmount,
    };

    if (isConfirmed) {
      update.status = 'refunded';
      update.gatewayRefundId = gatewayRefundId;
    }

    return Payment.findOneAndUpdate({ bookingId }, { $set: update }, { new: true, ...(session ? { session } : {}) });
  }

  /**
   * Record cash confirmation by rider or lab admin
   * @param {Object} params
   * @param {string} params.bookingId
   * @param {string} params.confirmedByUserId
   * @returns {Promise<Payment|null>}
   */
  async recordCashConfirmation({ bookingId, confirmedByUserId, amount, session = null }) {
    let payment = await Payment.findOne({ bookingId }).session(session);
    if (!payment) {
      payment = new Payment({
        bookingId,
        amount,
        status: 'captured',
        confirmedBy: confirmedByUserId,
        confirmedAt: new Date(),
      });
      return payment.save({ session });
    }

    payment.status = 'captured';
    payment.confirmedBy = confirmedByUserId;
    payment.confirmedAt = new Date();
    return payment.save({ session });
  }
}

export const paymentRepository = new PaymentRepository();
export default paymentRepository;
