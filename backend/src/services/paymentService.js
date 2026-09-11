import mongoose from 'mongoose';
import { paymentRepository } from '../repositories/paymentRepository.js';
import { bookingRepository } from '../repositories/bookingRepository.js';
import { razorpayClient } from '../utils/razorpayClient.js';
import { razorpayConfig } from '../config/razorpayConfig.js';
import { Booking } from '../schemas/Booking.js';
import { Rider } from '../schemas/Rider.js';
import { runInTransaction } from '../utils/transactionHelper.js';
import { AppError } from '../utils/AppError.js';
import logger from '../utils/logger.js';

export class PaymentService {
  /**
   * Create a Razorpay Order for an existing booking
   * @param {Object} params
   * @param {string} params.bookingId
   * @param {string} params.userId
   * @returns {Promise<Object>}
   */
  async createRazorpayOrder({ bookingId, userId }) {
    if (!mongoose.Types.ObjectId.isValid(bookingId)) {
      throw new AppError('Booking not found', 404, 'BOOKING_NOT_FOUND');
    }

    const booking = await bookingRepository.findById(bookingId);

    // Strict 404 on non-existence or unowned record per CONTEXT §3.2
    if (!booking || booking.patientId.toString() !== userId.toString()) {
      throw new AppError('Booking not found', 404, 'BOOKING_NOT_FOUND');
    }

    if (booking.paymentStatus === 'paid') {
      throw new AppError('This booking is already paid', 400, 'PAYMENT_ALREADY_COMPLETED');
    }

    // Amount in paise (1 INR = 100 paise)
    const amountPaise = Math.round(booking.amount * 100);

    const order = await razorpayClient.createOrder({
      amountPaise,
      currency: 'INR',
      receipt: booking._id.toString(),
      notes: {
        bookingId: booking._id.toString(),
        patientId: userId.toString(),
        mode: booking.mode,
      },
    });

    // Persist Payment record in DB
    await paymentRepository.createPayment({
      bookingId: booking._id,
      amount: booking.amount,
      gatewayOrderId: order.id,
      status: 'created',
    });

    return {
      orderId: order.id,
      amount: order.amount,
      currency: order.currency || 'INR',
      keyId: razorpayConfig.keyId,
    };
  }

  /**
   * Verify raw-body HMAC signature
   * @param {string|Buffer} rawBody
   * @param {string} signature
   * @returns {boolean}
   */
  verifyWebhookSignature(rawBody, signature) {
    return razorpayClient.verifyWebhookSignature(rawBody, signature);
  }

  /**
   * Handle payment.captured webhook event asynchronously
   * @param {Object} params
   * @param {string} params.gatewayOrderId
   * @param {string} params.gatewayPaymentId
   * @param {string} params.eventId
   * @param {number} [params.amount]
   * @returns {Promise<Object>}
   */
  async handlePaymentCaptured({ gatewayOrderId, gatewayPaymentId, eventId, amount }) {
    // 1. Deduplication on event ID (CONTEXT §3.3 & §6.2)
    if (eventId) {
      const alreadyProcessed = await paymentRepository.hasProcessedEvent(eventId);
      if (alreadyProcessed) {
        logger.info(`Webhook event ${eventId} already processed. Skipping duplicate.`);
        return { status: 'duplicate_event', eventId };
      }
    }

    // 2. Payment capture and the booking flag are ONE fact about the world:
    //    a captured payment whose booking still reads 'pending' is a support
    //    ticket. Both writes commit together or neither does (HIGH H3).
    const payment = await runInTransaction(
      async (session) => {
        const updated = await paymentRepository.recordCapturedPayment({
          gatewayOrderId,
          gatewayPaymentId,
          eventId,
          amount,
          session,
        });

        if (updated) {
          await Booking.updateOne(
            { _id: updated.bookingId },
            { $set: { paymentStatus: 'paid' } },
            session ? { session } : {}
          );
        }

        return updated;
      },
      { label: 'webhook.paymentCaptured' }
    );

    if (!payment) {
      // The conditional update matched nothing. Either this event was already
      // applied (a concurrent duplicate that won the race), or there is no
      // payment for this order at all. Distinguish them so a duplicate is not
      // reported as a missing record.
      const existing = await paymentRepository.findByGatewayOrderId(gatewayOrderId);
      if (existing) {
        logger.info(`Webhook event ${eventId} already applied to order ${gatewayOrderId}. Skipping.`);
        return { status: 'duplicate_event', eventId };
      }

      logger.warn(`No payment record found for order ${gatewayOrderId}. Event recorded.`);
      return { status: 'payment_not_found', gatewayOrderId };
    }

    logger.info(`Booking ${payment.bookingId} marked as paid via webhook event ${eventId}`);
    return { status: 'success', bookingId: payment.bookingId, paymentId: payment._id };
  }

  /**
   * Verify the actor may confirm cash against THIS booking.
   *
   * Enforced in the service rather than a controller because three routes reach
   * this method (payments, rider, lab). Only the rider and lab routes checked
   * entitlement; /api/payments/confirm-cash/:bookingId checked role alone, so
   * any account with role 'rider' could mark ANY booking paid.
   *
   * Entitlement failures are 404, never 403 (CONTEXT §3.2).
   */
  async assertCanConfirmCash({ booking, actorUserId, actorRole, actorLabCenterId }) {
    const notFound = () => new AppError('Booking not found', 404, 'BOOKING_NOT_FOUND');

    if (actorRole === 'super_admin') {
      return;
    }

    if (actorRole === 'rider') {
      if (!booking.assignedRiderId) {
        throw notFound();
      }
      const rider = await Rider.findOne({ userId: actorUserId }).select('_id');
      if (!rider || booking.assignedRiderId.toString() !== rider._id.toString()) {
        throw notFound();
      }
      return;
    }

    if (actorRole === 'lab_admin') {
      // Fail closed: an admin bound to no centre is entitled to nothing.
      const centreId = actorLabCenterId ? actorLabCenterId.toString() : null;
      if (!centreId) {
        throw notFound();
      }
      if (!booking.labCenterId || booking.labCenterId.toString() !== centreId) {
        throw notFound();
      }
      return;
    }

    throw notFound();
  }

  /**
   * Confirm cash payment by an authorized rider or lab admin
   * @param {Object} params
   * @param {string} params.bookingId
   * @param {string} params.confirmedByUserId
   * @param {string} params.actorRole - Role of the confirming account
   * @param {string} [params.actorLabCenterId] - Required for lab_admin
   * @returns {Promise<Object>}
   */
  async confirmCashPayment({ bookingId, confirmedByUserId, actorRole, actorLabCenterId = null }) {
    if (!mongoose.Types.ObjectId.isValid(bookingId)) {
      throw new AppError('Booking not found', 404, 'BOOKING_NOT_FOUND');
    }

    const booking = await Booking.findById(bookingId);
    if (!booking) {
      throw new AppError('Booking not found', 404, 'BOOKING_NOT_FOUND');
    }

    await this.assertCanConfirmCash({
      booking,
      actorUserId: confirmedByUserId,
      actorRole,
      actorLabCenterId,
    });

    if (booking.paymentMode !== 'cash') {
      throw new AppError('This booking is not marked for cash payment', 400, 'INVALID_PAYMENT_MODE');
    }

    if (booking.paymentStatus === 'paid') {
      throw new AppError('Cash payment is already confirmed', 400, 'ALREADY_CONFIRMED');
    }

    // The Payment row and the booking flag must agree: cash recorded against a
    // booking that still reads 'pending' double-bills the patient (HIGH H3).
    await runInTransaction(
      async (session) => {
        await paymentRepository.recordCashConfirmation({
          bookingId: booking._id,
          confirmedByUserId,
          amount: booking.amount,
          session,
        });

        await Booking.updateOne(
          { _id: booking._id },
          { $set: { paymentStatus: 'paid' } },
          session ? { session } : {}
        );
      },
      { label: 'payment.confirmCash' }
    );

    booking.paymentStatus = 'paid';
    return booking;
  }
}

export const paymentService = new PaymentService();
export default paymentService;
