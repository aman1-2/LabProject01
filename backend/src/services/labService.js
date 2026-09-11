// backend/src/services/labService.js
import mongoose from 'mongoose';
import Booking from '../schemas/Booking.js';
import LabCenter from '../schemas/LabCenter.js';
import Sample from '../schemas/Sample.js';
import Report from '../schemas/Report.js';
import statusTransitionService from './statusTransitionService.js';
import paymentService from './paymentService.js';
import { AppError } from '../utils/AppError.js';
import logger from '../utils/logger.js';

export class LabService {
  /**
   * Get operational queue for a specific lab centre
   * @param {Object} params
   * @param {string} params.labCenterId
   * @param {string} [params.status]
   * @param {number} [params.page=1]
   * @param {number} [params.limit=50]
   */
  async getLabQueue({ labCenterId, status, page = 1, limit = 50 }) {
    if (!labCenterId || !mongoose.Types.ObjectId.isValid(labCenterId)) {
      throw new AppError('Invalid lab centre ID', 400, 'INVALID_LAB_CENTER');
    }

    const query = {
      labCenterId: new mongoose.Types.ObjectId(labCenterId),
    };

    if (status && status !== 'all') {
      query.status = status;
    }

    const skip = (Math.max(1, page) - 1) * limit;

    const [bookings, total] = await Promise.all([
      Booking.find(query)
        .populate('testIds', 'name slug basePrice turnaroundHrs sampleType')
        // Packages were never populated here, even when the field was singular.
        // A booking of a checkup plus an extra test showed the lab only the
        // extra test — so the panel the patient actually paid for was invisible
        // to the people who have to run it.
        .populate('packageIds', 'name slug basePrice turnaroundHrs sampleType')
        .populate('patientId', 'name phone accountHandle')
        .populate('familyMemberId', 'name relation age')
        .sort({ slotDateTime: 1, createdAt: 1 })
        .skip(skip)
        .limit(limit)
        .lean(),
      Booking.countDocuments(query),
    ]);

    // Attach sample barcode and report info for each booking
    const bookingIds = bookings.map((b) => b._id);
    const [samples, reports] = await Promise.all([
      Sample.find({ bookingId: { $in: bookingIds } }).lean(),
      Report.find({ bookingId: { $in: bookingIds } })
        .populate('recommendedDoctorId', 'name specialization clinicName')
        .populate('authoredBy', 'name accountHandle')
        .lean(),
    ]);

    const sampleMap = new Map(samples.map((s) => [s.bookingId.toString(), s]));
    const reportMap = new Map(reports.map((r) => [r.bookingId.toString(), r]));

    const now = Date.now();
    const enrichedBookings = bookings.map((b) => {
      const bId = b._id.toString();
      const sample = sampleMap.get(bId) || null;
      const report = reportMap.get(bId) || null;

      // Check near auto-cancel (within 2 hours of autoCancelAt for unconfirmed lab visits)
      let nearAutoCancel = false;
      let autoCancelHoursLeft = null;

      if (b.mode === 'visit' && b.status === 'awaiting_confirm' && b.autoCancelAt) {
        const msLeft = new Date(b.autoCancelAt).getTime() - now;
        autoCancelHoursLeft = Math.max(0, Math.round((msLeft / (1000 * 60 * 60)) * 10) / 10);
        nearAutoCancel = msLeft <= 2 * 60 * 60 * 1000;
      }

      return {
        ...b,
        sample,
        barcode: b.barcode || sample?.barcode || null,
        report,
        nearAutoCancel,
        autoCancelHoursLeft,
      };
    });

    return {
      bookings: enrichedBookings,
      pagination: {
        total,
        page: Number(page),
        limit: Number(limit),
        pages: Math.ceil(total / limit),
      },
    };
  }

  /**
   * Confirm lab-visit arrival
   * PATCH /api/lab/bookings/:id/confirm
   */
  async confirmLabArrival({ bookingId, labCenterId, actorUserId }) {
    if (!mongoose.Types.ObjectId.isValid(bookingId)) {
      throw new AppError('Booking not found', 404, 'BOOKING_NOT_FOUND');
    }

    const booking = await Booking.findById(bookingId);

    // Return 404 on unowned or missing booking per CONTEXT §3.2
    if (!booking || !booking.labCenterId || booking.labCenterId.toString() !== labCenterId.toString()) {
      throw new AppError('Booking not found', 404, 'BOOKING_NOT_FOUND');
    }

    if (booking.status !== 'awaiting_confirm') {
      throw new AppError(
        `Cannot confirm booking in '${booking.status}' status. Must be 'awaiting_confirm'.`,
        400,
        'INVALID_STATUS_TRANSITION'
      );
    }

    const updatedBooking = await statusTransitionService.transitionBookingStatus({
      bookingId,
      newStatus: 'confirmed',
      // labCenterId is required: statusTransitionService treats a lab admin
      // without one as entitled to no booking at all.
      actor: { userId: actorUserId, role: 'lab_admin', labCenterId },
      metadata: { confirmedAtCenter: labCenterId },
    });

    logger.info('Lab visit confirmed at centre', {
      bookingId,
      labCenterId,
      confirmedBy: actorUserId,
    });

    return updatedBooking;
  }

  /**
   * Confirm cash payment at the lab centre
   * POST /api/lab/bookings/:id/cash-received
   */
  async confirmLabCashPayment({ bookingId, labCenterId, confirmingUserId }) {
    if (!mongoose.Types.ObjectId.isValid(bookingId)) {
      throw new AppError('Booking not found', 404, 'BOOKING_NOT_FOUND');
    }

    const booking = await Booking.findById(bookingId);

    // Return 404 on unowned or missing booking per CONTEXT §3.2
    if (!booking || !booking.labCenterId || booking.labCenterId.toString() !== labCenterId.toString()) {
      throw new AppError('Booking not found', 404, 'BOOKING_NOT_FOUND');
    }

    const updatedBooking = await paymentService.confirmCashPayment({
      bookingId,
      confirmedByUserId: confirmingUserId,
      // Required: the service treats a lab admin without a centre as entitled
      // to nothing. The centre match above is verified again there.
      actorRole: 'lab_admin',
      actorLabCenterId: labCenterId,
    });

    logger.info('Cash payment confirmed at lab centre', {
      bookingId,
      labCenterId,
      confirmedBy: confirmingUserId,
      amount: updatedBooking.amount,
    });

    return updatedBooking;
  }

  /**
   * Get centre profile (read-only accreditation status)
   * GET /api/lab/profile
   */
  async getLabProfile({ labCenterId }) {
    if (!labCenterId || !mongoose.Types.ObjectId.isValid(labCenterId)) {
      throw new AppError('Lab centre profile not found', 404, 'LAB_NOT_FOUND');
    }

    const lab = await LabCenter.findById(labCenterId).lean();
    if (!lab) {
      throw new AppError('Lab centre profile not found', 404, 'LAB_NOT_FOUND');
    }

    return {
      _id: lab._id,
      name: lab.name,
      area: lab.area,
      accreditation: lab.accreditation,
      priceMultiplier: lab.priceMultiplier,
      turnaroundHrs: lab.turnaroundHrs,
      isVerified: lab.isVerified,
      isOwned: lab.isOwned,
      serviceAreaPincodes: lab.serviceAreaPincodes || [],
    };
  }
}

export const labService = new LabService();
export default labService;
