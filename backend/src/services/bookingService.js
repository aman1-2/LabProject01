import { bookingRepository } from '../repositories/bookingRepository.js';
import { findLabById } from '../repositories/labRepository.js';
import { findTestById, findTestBySlug } from '../repositories/testRepository.js';
import { calculateBookingPrice } from './pricingService.js';
import { BUSINESS_CONFIG } from '../config/businessConfig.js';
import { AppError } from '../utils/AppError.js';
import { Booking } from '../schemas/Booking.js';
import { Payment } from '../schemas/Payment.js';
import { Doctor } from '../schemas/Doctor.js';
import { ExternalReferralMention } from '../schemas/ExternalReferralMention.js';
import { normalizeDoctorName } from '../utils/referralNormalizer.js';
import { riderAllocationService } from './riderAllocationService.js';
import { sampleService } from './sampleService.js';
import { emitBookingStatusUpdate } from '../sockets/socketServer.js';
import familyMemberRepository from '../repositories/familyMemberRepository.js';
import * as addressRepository from '../repositories/addressRepository.js';
import { razorpayClient } from '../utils/razorpayClient.js';
import { runInTransaction, supportsTransactions } from '../utils/transactionHelper.js';
import { isFeatureEnabled } from '../config/featureFlags.js';
import logger from '../utils/logger.js';
import mongoose from 'mongoose';

export class BookingService {
  /**
   * Create a booking with idempotency check, server pricing, and mode validation
   * @param {Object} params
   * @param {string} params.patientId
   * @param {string} params.idempotencyKey
   * @param {Object} params.bookingData
   * @returns {Promise<{ booking: Object, isReplay: boolean }>}
   */
  async createBooking({ patientId, idempotencyKey, bookingData }) {
    if (!idempotencyKey || typeof idempotencyKey !== 'string' || !idempotencyKey.trim()) {
      throw new AppError('Idempotency-Key header is required', 400, 'MISSING_IDEMPOTENCY_KEY');
    }

    const trimmedKey = idempotencyKey.trim();

    // 1. Check idempotency replay
    const existing = await bookingRepository.findByIdempotencyKey(trimmedKey);
    if (existing) {
      if (existing.patientId.toString() !== patientId.toString()) {
        throw new AppError(
          'Idempotency key has already been used for another request',
          409,
          'IDEMPOTENCY_KEY_CONFLICT'
        );
      }
      return { booking: existing, isReplay: true };
    }

    // 2. Validate family member ownership if familyMemberId provided (CONTEXT §3.2)
    if (bookingData.familyMemberId) {
      const member = await familyMemberRepository.findByIdAndOwner(bookingData.familyMemberId, patientId);
      if (!member) {
        throw new AppError('Family member not found', 404, 'FAMILY_MEMBER_NOT_FOUND');
      }
    }

    // 3. Validate laboratory
    const lab = await findLabById(bookingData.labCenterId);
    if (!lab) {
      throw new AppError('Selected laboratory not found', 404, 'LAB_NOT_FOUND');
    }
    // `=== false` let a centre with the field absent or null through. Only an
    // explicitly verified centre may receive bookings.
    if (!lab.isVerified) {
      throw new AppError(
        'Selected lab centre is not verified to receive bookings',
        422,
        'LAB_NOT_VERIFIED'
      );
    }

    // 3. Resolve and validate tests
    const tests = [];
    if (Array.isArray(bookingData.testIds) && bookingData.testIds.length > 0) {
      for (const testId of bookingData.testIds) {
        let test = null;
        if (mongoose.Types.ObjectId.isValid(testId)) {
          test = await findTestById(testId);
        }
        if (!test) {
          test = await findTestBySlug(testId);
        }
        if (!test) {
          throw new AppError(`Test '${testId}' not found in catalogue`, 404, 'TEST_NOT_FOUND');
        }
        tests.push(test);
      }
    }

    // Validate packages. `packageIds` is the shape; a singular `packageId` is
    // still accepted and folded in, because the mobile app sends it and a
    // write path that breaks halfway through a rollout is not worth the
    // tidiness. De-duplicated so the same package arriving in both shapes —
    // which is exactly what a half-updated client sends — is charged once.
    const packageRefs = [
      ...(Array.isArray(bookingData.packageIds) ? bookingData.packageIds : []),
      ...(bookingData.packageId ? [bookingData.packageId] : []),
    ];

    const packageItems = [];
    const seenPackageIds = new Set();

    for (const reference of packageRefs) {
      let found = null;
      if (mongoose.Types.ObjectId.isValid(reference)) {
        found = await findTestById(reference);
      }
      if (!found) {
        found = await findTestBySlug(reference);
      }
      if (!found) {
        throw new AppError('Selected package not found in catalogue', 404, 'PACKAGE_NOT_FOUND');
      }

      const id = found._id.toString();
      if (seenPackageIds.has(id)) continue;
      seenPackageIds.add(id);
      packageItems.push(found);
    }

    if (tests.length === 0 && packageItems.length === 0) {
      throw new AppError(
        'At least one test or package must be selected for booking',
        400,
        'INVALID_BOOKING_ITEMS'
      );
    }

    // 4. Validate mode feasibility (PATHCARE_CONTEXT.md §3.1)
    // Imaging tests cannot be booked as home collection (homeCollectionAvailable: false)
    if (bookingData.mode === 'home') {
      const unavailableTest = tests.find((t) => t.homeCollectionAvailable === false);
      const unavailablePackage = packageItems.find((p) => p.homeCollectionAvailable === false);
      if (unavailableTest || unavailablePackage) {
        const item = unavailableTest || unavailablePackage;
        throw new AppError(
          `Home collection is not available for '${item.name}'. Please choose lab visit mode.`,
          422,
          'HOME_COLLECTION_UNAVAILABLE'
        );
      }
    }

    // 4b. Resolve the collection address for home mode and SNAPSHOT it.
    //     Scoped to the caller's own address book: an address belonging to
    //     someone else must be indistinguishable from one that does not exist
    //     (CONTEXT §3.2).
    let collectionAddress = null;
    if (bookingData.mode === 'home') {
      const address = await addressRepository.findByIdAndOwner(
        bookingData.addressId,
        patientId
      );
      if (!address) {
        throw new AppError('Address not found', 404, 'ADDRESS_NOT_FOUND');
      }
      collectionAddress = {
        addressId: address._id,
        label: address.label,
        line: address.line,
        pincode: address.pincode,
        lat: address.lat,
        lng: address.lng,
      };
    }

    // 5. Server-side price calculation (discard client amount per §3.1)
    const multiplier = lab.priceMultiplier ?? 1.0;
    const amount = calculateBookingPrice({ tests, packageItems, multiplier });

    // 6. Set status and autoCancelAt based on mode
    const slotDate = new Date(bookingData.slotDateTime);
    let status = 'pending';
    let autoCancelAt = null;

    if (bookingData.mode === 'visit') {
      status = 'awaiting_confirm';
      autoCancelAt = new Date(
        slotDate.getTime() + BUSINESS_CONFIG.autoCancelWindowHours * 60 * 60 * 1000
      );
    } else {
      status = 'pending';
      autoCancelAt = null;
    }

    // 7. Referral source handling
    let referralSource = { type: 'none', partnerDoctorId: null, externalText: null };
    const rawExternal =
      bookingData.referralSource?.externalText || bookingData.referralSource?.doctorName;
    if (bookingData.referralSource?.type === 'partner' && bookingData.referralSource.partnerDoctorId) {
      referralSource = {
        type: 'partner',
        partnerDoctorId: bookingData.referralSource.partnerDoctorId,
        externalText: null,
      };
    } else if (bookingData.referralSource?.type === 'external' && rawExternal) {
      referralSource = {
        type: 'external',
        partnerDoctorId: null,
        externalText: rawExternal.trim(),
      };
    }

    // 8. Create booking record wrapped with rider allocation in ONE transaction for home mode (CONTEXT §4.1, §6.1)
    let createdBooking = null;

    // Automatic dispatch is a kill switch, not a new-feature gate: it is ON
    // unless FF_DYNAMIC_DISPATCH is explicitly false. Disabling it degrades to
    // manual dispatch — the booking is still created and appears on the rider
    // job board (GET /api/rider/jobs) — rather than failing the booking
    // outright, which is the rollback §3.5 describes.
    const autoDispatchEnabled = isFeatureEnabled('DYNAMIC_DISPATCH', { defaultValue: true });

    // Documented capability probe rather than a private driver internal (M6).
    const isReplicaSet = await supportsTransactions();
    if (isReplicaSet) {
      const session = await mongoose.startSession();
      try {
        await session.withTransaction(async () => {
          const [newBooking] = await Booking.create(
            [
              {
                patientId,
                familyMemberId: bookingData.familyMemberId || null,
                testIds: tests.map((t) => t._id),
                packageIds: packageItems.map((p) => p._id),
                labCenterId: lab._id,
                mode: bookingData.mode,
                slotDateTime: slotDate,
                status,
                amount,
                paymentMode: bookingData.paymentMode || 'upi',
                paymentStatus: 'pending',
                referralSource,
                idempotencyKey: trimmedKey,
                autoCancelAt,
                collectionAddress,
              },
            ],
            { session }
          );

          createdBooking = newBooking;

          // For home collection: claim rider atomically within the same transaction
          if (bookingData.mode === 'home' && autoDispatchEnabled) {
            let bookingCoords = collectionAddress
              ? { lat: collectionAddress.lat, lng: collectionAddress.lng }
              : null;
            if (!bookingCoords && bookingData.coordinates && Array.isArray(bookingData.coordinates)) {
              bookingCoords = { lng: bookingData.coordinates[0], lat: bookingData.coordinates[1] };
            } else if (bookingData.location?.coordinates && Array.isArray(bookingData.location.coordinates)) {
              bookingCoords = { lng: bookingData.location.coordinates[0], lat: bookingData.location.coordinates[1] };
            } else if (bookingData.lat && bookingData.lng) {
              bookingCoords = { lat: Number(bookingData.lat), lng: Number(bookingData.lng) };
            }

            await riderAllocationService.allocateRiderForBooking({
              booking: createdBooking,
              session,
              coordinates: bookingCoords,
            });
          }

          // Process referral tracking atomically per CONTEXT §2.2 & prompt
          if (referralSource?.type === 'partner' && referralSource.partnerDoctorId) {
            await Doctor.updateOne(
              { _id: referralSource.partnerDoctorId },
              { $inc: { referralCount: 1 } },
              { session }
            );
          } else if (referralSource?.type === 'external' && referralSource.externalText) {
            const rawName = referralSource.externalText.trim();
            const normalizedName = normalizeDoctorName(rawName);
            if (normalizedName) {
              await ExternalReferralMention.updateOne(
                { normalizedName },
                {
                  $inc: { mentionCount: 1 },
                  $set: { lastMentionedAt: new Date() },
                  $setOnInsert: {
                    rawName,
                    status: 'New',
                    notes: '',
                  },
                },
                { upsert: true, session }
              );
            }
          }
        });
      } finally {
        await session.endSession();
      }
    } else {
      // Non-replica fallback: ensures zero orphan records if allocation fails
      const [newBooking] = await Booking.create([
        {
          patientId,
          familyMemberId: bookingData.familyMemberId || null,
          testIds: tests.map((t) => t._id),
          packageIds: packageItems.map((p) => p._id),
          labCenterId: lab._id,
          mode: bookingData.mode,
          slotDateTime: slotDate,
          status,
          amount,
          paymentMode: bookingData.paymentMode || 'upi',
          paymentStatus: 'pending',
          referralSource,
          idempotencyKey: trimmedKey,
          autoCancelAt,
          collectionAddress,
        },
      ]);

      createdBooking = newBooking;

      try {
        if (bookingData.mode === 'home' && autoDispatchEnabled) {
          let bookingCoords = collectionAddress
            ? { lat: collectionAddress.lat, lng: collectionAddress.lng }
            : null;
          if (!bookingCoords && bookingData.coordinates && Array.isArray(bookingData.coordinates)) {
            bookingCoords = { lng: bookingData.coordinates[0], lat: bookingData.coordinates[1] };
          } else if (bookingData.location?.coordinates && Array.isArray(bookingData.location.coordinates)) {
            bookingCoords = { lng: bookingData.location.coordinates[0], lat: bookingData.location.coordinates[1] };
          } else if (bookingData.lat && bookingData.lng) {
            bookingCoords = { lat: Number(bookingData.lat), lng: Number(bookingData.lng) };
          }

          await riderAllocationService.allocateRiderForBooking({
            booking: createdBooking,
            session: null,
            coordinates: bookingCoords,
          });
        }
      } catch (err) {
        if (createdBooking?._id) {
          await Booking.deleteOne({ _id: createdBooking._id });
        }
        throw err;
      }

      // Process referral tracking atomically per CONTEXT §2.2 & prompt
      if (referralSource?.type === 'partner' && referralSource.partnerDoctorId) {
        await Doctor.updateOne(
          { _id: referralSource.partnerDoctorId },
          { $inc: { referralCount: 1 } }
        );
      } else if (referralSource?.type === 'external' && referralSource.externalText) {
        const rawName = referralSource.externalText.trim();
        const normalizedName = normalizeDoctorName(rawName);
        if (normalizedName) {
          await ExternalReferralMention.updateOne(
            { normalizedName },
            {
              $inc: { mentionCount: 1 },
              $set: { lastMentionedAt: new Date() },
              $setOnInsert: {
                rawName,
                status: 'New',
                notes: '',
              },
            },
            { upsert: true }
          );
        }
      }
    }

    const populated = await bookingRepository.findById(createdBooking._id);

    return { booking: populated, isReplay: false };
  }

  /**
   * Get all bookings for authenticated patient
   * @param {string} patientId
   * @param {Object} [options]
   * @returns {Promise<Array<Object>>}
   */
  async getPatientBookings(patientId, options = {}) {
    return bookingRepository.findByPatientId(patientId, options);
  }

  /**
   * Get booking details. Strictly returns 404 (never 403) on unowned records per CONTEXT §3.2
   * @param {string} bookingId
   * @param {string} patientId
   * @returns {Promise<Object>}
   */
  async getBookingDetails(bookingId, patientId) {
    if (!mongoose.Types.ObjectId.isValid(bookingId)) {
      throw new AppError('Booking not found', 404, 'BOOKING_NOT_FOUND');
    }

    const booking = await bookingRepository.findById(bookingId);

    // CRITICAL: Return 404 if booking doesn't exist or is not owned by the caller
    if (!booking || booking.patientId.toString() !== patientId.toString()) {
      throw new AppError('Booking not found', 404, 'BOOKING_NOT_FOUND');
    }

    const bookingObj = booking.toObject ? booking.toObject() : { ...booking };
    const sample = await sampleService.getSampleByBookingId(bookingId, { userId: patientId, role: 'patient' }).catch(() => null);
    if (sample) {
      bookingObj.sample = sample;
    }

    return bookingObj;
  }

  /**
   * Reschedule a booking to a new slot (free, validates future slot, updates autoCancelAt if visit)
   * Blocked once status reaches 'collected'
   */
  async rescheduleBooking({ bookingId, patientId, slotDateTime }) {
    if (!mongoose.Types.ObjectId.isValid(bookingId)) {
      throw new AppError('Booking not found', 404, 'BOOKING_NOT_FOUND');
    }

    const booking = await Booking.findById(bookingId);
    if (!booking || booking.patientId.toString() !== patientId.toString()) {
      throw new AppError('Booking not found', 404, 'BOOKING_NOT_FOUND');
    }

    if (['collected', 'at_lab', 'report_ready'].includes(booking.status)) {
      throw new AppError('Cannot reschedule a booking after specimen collection', 400, 'CANNOT_RESCHEDULE_COLLECTED');
    }

    if (booking.status === 'cancelled') {
      throw new AppError('Cannot reschedule a cancelled booking', 400, 'CANNOT_RESCHEDULE_CANCELLED');
    }

    const newSlot = new Date(slotDateTime);
    if (isNaN(newSlot.getTime()) || newSlot <= new Date()) {
      throw new AppError('New slot time must be a valid future date and time', 400, 'INVALID_SLOT_TIME');
    }

    booking.slotDateTime = newSlot;

    // Update autoCancelAt for lab visits (slotDateTime + autoCancelWindowHours)
    if (booking.mode === 'visit') {
      booking.autoCancelAt = new Date(
        newSlot.getTime() + (BUSINESS_CONFIG.autoCancelWindowHours || 8) * 3600 * 1000
      );
    }

    await booking.save();

    emitBookingStatusUpdate(booking._id, {
      bookingId: booking._id.toString(),
      status: booking.status,
      mode: booking.mode,
      slotDateTime: booking.slotDateTime,
    });

    return bookingRepository.findById(booking._id);
  }

  /**
   * Cancel a booking with config-driven refund calculation and rider pool release.
   * Blocked once status reaches 'collected'.
   *
   * Refund state is NEVER recorded optimistically. A refund is reported to the
   * patient only when Razorpay has confirmed it; a failed gateway call leaves the
   * Payment in 'failed' for operator follow-up and reports refundAmount 0.
   */
  async cancelBooking({ bookingId, patientId, reason }) {
    if (!mongoose.Types.ObjectId.isValid(bookingId)) {
      throw new AppError('Booking not found', 404, 'BOOKING_NOT_FOUND');
    }

    const booking = await Booking.findById(bookingId);
    if (!booking || booking.patientId.toString() !== patientId.toString()) {
      throw new AppError('Booking not found', 404, 'BOOKING_NOT_FOUND');
    }

    if (['collected', 'at_lab', 'report_ready'].includes(booking.status)) {
      throw new AppError('Cannot cancel booking after specimen collection', 400, 'CANNOT_CANCEL_COLLECTED');
    }

    if (booking.status === 'cancelled') {
      throw new AppError('Booking is already cancelled', 400, 'ALREADY_CANCELLED');
    }

    const previousStatus = booking.status;

    // Claim the cancellation ATOMICALLY so exactly one concurrent request proceeds
    // to the gateway. Without this filter two simultaneous cancels would each issue
    // a refund for the same payment.
    const claimed = await Booking.findOneAndUpdate(
      {
        _id: booking._id,
        patientId: booking.patientId,
        status: { $nin: ['cancelled', 'collected', 'at_lab', 'report_ready'] },
      },
      {
        $set: {
          status: 'cancelled',
          cancelReason: reason || 'Cancelled by user',
          assignedRiderId: null,
        },
      },
      { new: true }
    );

    if (!claimed) {
      // Lost the race, or status advanced between the read and the claim.
      const current = await Booking.findById(booking._id);
      if (current && current.status === 'cancelled') {
        throw new AppError('Booking is already cancelled', 400, 'ALREADY_CANCELLED');
      }
      throw new AppError('Cannot cancel booking after specimen collection', 400, 'CANNOT_CANCEL_COLLECTED');
    }

    // Release rider back to available status and Redis geo pool
    if (booking.assignedRiderId) {
      await riderAllocationService.releaseRider({ riderId: booking.assignedRiderId });
    }

    // Config-driven refund calculation (CONTEXT §3.4, §6.3)
    const isPrepaid = booking.paymentStatus === 'paid';
    let cancellationFee = 0;
    let refundAmount = 0;
    let refundStatus = 'none';

    if (isPrepaid) {
      cancellationFee = BUSINESS_CONFIG.cancellationFee || 20;
      const intendedRefund = Math.max(0, (booking.amount || 0) - cancellationFee);

      const payment = await Payment.findOne({ bookingId: booking._id });

      if (!payment || !payment.gatewayPaymentId) {
        // Nothing was ever captured at the gateway, so nothing can be returned.
        // Record it rather than silently reporting a refund that cannot happen.
        refundStatus = 'failed';
        if (payment) {
          payment.refundStatus = 'failed';
          payment.refundAmount = 0;
          await payment.save();
        }
        logger.error('Cancellation refund could not be issued: no captured gateway payment', {
          bookingId: booking._id.toString(),
          intendedRefund,
          hasPaymentRecord: Boolean(payment),
        });
      } else if (intendedRefund <= 0) {
        refundStatus = 'none';
      } else {
        // Mark the attempt BEFORE calling out, so a crash mid-flight leaves a
        // discoverable 'pending' rather than no trace at all.
        payment.refundStatus = 'pending';
        payment.refundAmount = intendedRefund;
        await payment.save();

        try {
          const refund = await razorpayClient.createRefund({
            paymentId: payment.gatewayPaymentId,
            amountPaise: Math.round(intendedRefund * 100),
            notes: {
              bookingId: booking._id.toString(),
              reason: reason || 'Customer requested cancellation',
            },
          });

          // Only now is the money actually returned.
          refundAmount = intendedRefund;
          refundStatus = intendedRefund === payment.amount ? 'full' : 'partial';
          payment.refundStatus = refundStatus;
          payment.refundAmount = intendedRefund;
          payment.gatewayRefundId = refund?.id || null;
          payment.status = 'refunded';

          // Payment row and booking flag commit together. The gateway call is
          // deliberately outside: a transaction held open across an HTTP
          // request would be a long-lived lock (HIGH H3).
          await runInTransaction(
            async (session) => {
              await payment.save({ session });
              await Booking.updateOne(
                { _id: booking._id },
                { $set: { paymentStatus: 'refunded' } },
                session ? { session } : {}
              );
            },
            { label: 'booking.cancelRefundOutcome' }
          );

          logger.info('Cancellation refund confirmed by gateway', {
            bookingId: booking._id.toString(),
            gatewayRefundId: refund?.id || null,
            refundAmount,
          });
        } catch (err) {
          // The gateway refused or was unreachable. The money has NOT moved.
          // Do not report a refund to the patient and do not mark it complete.
          refundAmount = 0;
          refundStatus = 'failed';
          payment.refundStatus = 'failed';
          await payment.save();
          logger.error('Cancellation refund failed at gateway; manual intervention required', {
            bookingId: booking._id.toString(),
            gatewayPaymentId: payment.gatewayPaymentId,
            intendedRefund,
            error: err.message,
          });
        }
      }
    }

    emitBookingStatusUpdate(booking._id, {
      bookingId: booking._id.toString(),
      previousStatus,
      status: 'cancelled',
      mode: booking.mode,
      metadata: { reason: claimed.cancelReason, refundAmount, cancellationFee, refundStatus },
    });

    const populated = await bookingRepository.findById(booking._id);
    return {
      booking: populated,
      refundAmount,
      cancellationFee,
      refundStatus,
    };
  }

  /**
   * Create the booking for one CONFIRMED subscription cycle.
   *
   * Called from exactly one place — subscriptionService.applyConfirmedCharge,
   * on a `subscription.charged` webhook — and always inside that handler's
   * transaction, so the booking and the schedule advance commit together or
   * not at all.
   *
   * It deliberately does NOT go through createBooking(): that path takes a
   * client payload, re-prices against the live catalogue, and runs dispatch.
   * A cycle must be booked at the amount the MANDATE authorised, which is
   * frozen on the subscription. Re-pricing here would charge one number and
   * record another.
   *
   * The booking is created already `paid`: the money arrived first, which is
   * the whole point of the ordering.
   */
  async createSubscriptionBooking({ subscription, chargedAt = new Date(), session = null }) {
    // Deterministic, so a redelivered charge that somehow reached this point
    // still cannot produce a second row — the unique index on idempotencyKey
    // is the last line of defence behind the event-id claim.
    const cycleKey = `sub_${subscription._id}_${new Date(subscription.nextScheduledDate).getTime()}`;

    const existing = await bookingRepository.findByIdempotencyKey(cycleKey);
    if (existing) {
      return existing;
    }

    const slotDateTime = subscription.nextScheduledDate ?? chargedAt;

    const [created] = await Booking.create(
      [
        {
          patientId: subscription.patientId,
          testIds: [],
          // A subscription is one package on a cycle, so Subscription.packageId
          // stays singular; the booking it produces stores it as a list of one.
          packageIds: subscription.packageId ? [subscription.packageId] : [],
          labCenterId: subscription.labCenterId,
          mode: subscription.mode,
          slotDateTime,
          // Home cycles start pending so the normal dispatch sweep can assign a
          // phlebotomist; lab visits await the patient confirming arrival.
          status: subscription.mode === 'home' ? 'pending' : 'awaiting_confirm',
          amount: subscription.amount,
          paymentMode: 'upi',
          // The charge is already confirmed — that is why this ran at all.
          paymentStatus: 'paid',
          idempotencyKey: cycleKey,
          subscriptionId: subscription._id,
          collectionAddress: subscription.collectionAddress ?? null,
          referralSource: { type: 'none' },
        },
      ],
      session ? { session } : {}
    );

    logger.info('Subscription cycle booking created', {
      subscriptionId: String(subscription._id),
      bookingId: String(created._id),
      amount: subscription.amount,
    });

    return created;
  }
}


export const bookingService = new BookingService();
export default bookingService;
