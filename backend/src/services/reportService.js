// backend/src/services/reportService.js
import mongoose from 'mongoose';
import { reportRepository } from '../repositories/reportRepository.js';
import { Booking } from '../schemas/Booking.js';
import { Doctor } from '../schemas/Doctor.js';
import { User } from '../schemas/User.js';
import { statusTransitionService } from './statusTransitionService.js';
import { sanitizeReportSummary } from '../utils/htmlSanitizer.js';
// Imported as an object rather than named bindings so the storage layer can be
// substituted in tests. It no longer fabricates URLs (HIGH H8), so a test that
// needs one must supply it.
import s3Storage from '../utils/s3StorageService.js';
import { runInTransaction } from '../utils/transactionHelper.js';
import { AppError } from '../utils/AppError.js';
import logger from '../utils/logger.js';

export class ReportService {
  /**
   * Verify the caller may WRITE a report against this booking.
   *
   * Default-deny. The previous form only rejected when the user's labCenterId
   * was truthy, so an admin with the schema default of null (User.js:74-78)
   * passed straight through and could upload to, or publish over, any patient's
   * report. Entitlement failures are 404, never 403 (CONTEXT §3.2).
   */
  async assertCanWriteReport({ booking, labUserId, userRole }) {
    const notFound = () => new AppError('Booking not found', 404, 'BOOKING_NOT_FOUND');

    if (userRole === 'super_admin') {
      return;
    }

    if (userRole !== 'lab_admin') {
      throw notFound();
    }

    const user = await User.findById(labUserId);
    const userLabCenterId = user?.labCenterId ? user.labCenterId.toString() : null;

    // An admin bound to no centre is entitled to nothing.
    if (!userLabCenterId) {
      throw notFound();
    }

    if (!booking.labCenterId || booking.labCenterId.toString() !== userLabCenterId) {
      throw notFound();
    }
  }

  /**
   * Generate presigned S3 PUT URL for uploading private report PDF
   * POST /api/lab/reports/:bookingId/upload-url
   *
   * @param {Object} params
   * @param {string} params.bookingId
   * @param {string} params.labUserId
   * @param {string} params.userRole
   * @param {string} [params.contentType='application/pdf']
   * @returns {Promise<Object>}
   */
  async getUploadUrl({ bookingId, labUserId, userRole = 'lab_admin', contentType = 'application/pdf' }) {
    if (!mongoose.Types.ObjectId.isValid(bookingId)) {
      throw new AppError('Booking not found', 404, 'BOOKING_NOT_FOUND');
    }

    const booking = await Booking.findById(bookingId);
    if (!booking) {
      throw new AppError('Booking not found', 404, 'BOOKING_NOT_FOUND');
    }

    // Strict 404 on unowned lab booking per CONTEXT §3.2
    await this.assertCanWriteReport({ booking, labUserId, userRole });

    const labCenterId = booking.labCenterId.toString();
    const result = await s3Storage.generateReportUploadUrl({
      bookingId: booking._id.toString(),
      labCenterId,
      contentType,
      expiresIn: 900, // 15 minutes short TTL
    });

    return result;
  }

  /**
   * Publish diagnostic report with lab-written summary and manual specialist recommendation
   * POST /api/lab/reports/:bookingId/publish
   *
   * @param {Object} params
   * @param {string} params.bookingId
   * @param {string} params.labUserId - Authenticated lab user
   * @param {string} params.userRole
   * @param {string} params.pdfKey - Uploaded S3 key
   * @param {string} params.summaryHtml - Raw user-supplied summary
   * @param {string} [params.recommendedDoctorId] - Manual doctor pick (§2.4)
   * @param {string} [params.recommendationReason]
   * @param {string} [params.approvedBy]
   * @returns {Promise<Object>}
   */
  async publishReport({
    bookingId,
    labUserId,
    userRole = 'lab_admin',
    pdfKey,
    summaryHtml,
    recommendedDoctorId = null,
    recommendationReason = null,
    approvedBy = null,
  }) {
    if (!mongoose.Types.ObjectId.isValid(bookingId)) {
      throw new AppError('Booking not found', 404, 'BOOKING_NOT_FOUND');
    }

    const booking = await Booking.findById(bookingId);
    if (!booking) {
      throw new AppError('Booking not found', 404, 'BOOKING_NOT_FOUND');
    }

    // Ownership check (404 per CONTEXT §3.2)
    await this.assertCanWriteReport({ booking, labUserId, userRole });

    // Server-side HTML sanitisation strictly per CONTEXT §6.4
    const cleanSummary = sanitizeReportSummary(summaryHtml);
    if (!cleanSummary || cleanSummary.trim() === '') {
      throw new AppError('A valid plain-language report summary is required', 400, 'EMPTY_REPORT_SUMMARY');
    }

    // Validate recommended specialist if provided (Manual selection per §2.4)
    let validatedDoctorId = null;
    if (recommendedDoctorId) {
      if (!mongoose.Types.ObjectId.isValid(recommendedDoctorId)) {
        throw new AppError('Recommended doctor not found', 404, 'DOCTOR_NOT_FOUND');
      }
      const doctor = await Doctor.findById(recommendedDoctorId);
      if (!doctor) {
        throw new AppError('Recommended doctor not found', 404, 'DOCTOR_NOT_FOUND');
      }
      validatedDoctorId = doctor._id;
    }

    // The Report and the booking's status are ONE clinical fact. Previously the
    // Report was written first and the transition ran afterwards, so a booking
    // in a state from which 'report_ready' is unreachable left a published
    // report attached to a booking whose status never moved — the patient's app
    // showing no report while the record says one exists (HIGH H3).
    const { report, updatedBooking } = await runInTransaction(
      async (session) => {
        const existing = await reportRepository.findByBookingId(booking._id);

        let saved;
        if (existing) {
          // Append the previous version to editHistory (append-only, §2.4)
          const historyEntry = {
            summaryHtml: existing.summaryHtml,
            authoredBy: existing.authoredBy?._id || existing.authoredBy,
            editedAt: new Date(),
            changeNotes: 'Revised lab report summary',
          };

          saved = await reportRepository.updateReportAndAppendHistory(
            booking._id,
            {
              pdfUrl: pdfKey || existing.pdfUrl,
              summaryHtml: cleanSummary,
              authoredBy: labUserId,
              approvedBy: approvedBy || existing.approvedBy,
              recommendedDoctorId: validatedDoctorId,
              recommendationReason: recommendationReason || null,
            },
            historyEntry,
            session
          );
        } else {
          saved = await reportRepository.createReport(
            {
              bookingId: booking._id,
              pdfUrl: pdfKey,
              summaryHtml: cleanSummary,
              authoredBy: labUserId,
              approvedBy: approvedBy || null,
              recommendedDoctorId: validatedDoctorId,
              recommendationReason: recommendationReason || null,
              editHistory: [
                {
                  summaryHtml: cleanSummary,
                  authoredBy: labUserId,
                  editedAt: new Date(),
                  changeNotes: 'Initial published lab summary',
                },
              ],
            },
            session
          );
        }

        // Transition booking status to 'report_ready' per §5.2
        let transitioned = booking;
        if (booking.status !== 'report_ready') {
          transitioned = await statusTransitionService.transitionBookingStatus({
            bookingId: booking._id,
            newStatus: 'report_ready',
            metadata: {
              reportId: saved._id,
              hasSummary: true,
              hasDoctorRecommendation: Boolean(validatedDoctorId),
            },
            session,
          });
        }

        return { report: saved, updatedBooking: transitioned };
      },
      { label: 'report.publish' }
    );

    logger.info('Diagnostic report published successfully', {
      bookingId: booking._id.toString(),
      reportId: report._id.toString(),
      authoredBy: labUserId,
      hasRecommendedDoctor: Boolean(validatedDoctorId),
    });

    return {
      report,
      booking: updatedBooking,
    };
  }

  /**
   * Fetch report for a booking with strict ownership check and fresh signed download URL
   * GET /api/reports/:bookingId
   *
   * @param {Object} params
   * @param {string} params.bookingId
   * @param {Object} params.caller - { userId, role }
   * @returns {Promise<Object>}
   */
  async getPatientReport({ bookingId, caller }) {
    if (!mongoose.Types.ObjectId.isValid(bookingId)) {
      throw new AppError('Booking not found', 404, 'BOOKING_NOT_FOUND');
    }

    const booking = await Booking.findById(bookingId);
    if (!booking) {
      throw new AppError('Booking not found', 404, 'BOOKING_NOT_FOUND');
    }

    const callerId = (caller?.userId || caller?.id || '').toString();
    const isPatientOwner = booking.patientId && booking.patientId.toString() === callerId;
    const isSuperAdmin = caller?.role === 'super_admin';

    let isAuthorizedLabAdmin = false;
    if (caller?.role === 'lab_admin') {
      const user = await User.findById(callerId);
      if (user?.labCenterId && booking.labCenterId.toString() === user.labCenterId.toString()) {
        isAuthorizedLabAdmin = true;
      }
    }

    // Strict 404 on unowned resource per CONTEXT §3.2
    if (!isPatientOwner && !isAuthorizedLabAdmin && !isSuperAdmin) {
      throw new AppError('Booking not found', 404, 'BOOKING_NOT_FOUND');
    }

    const report = await reportRepository.findByBookingId(booking._id);
    if (!report) {
      throw new AppError('Diagnostic report is not yet ready for this booking', 404, 'REPORT_NOT_FOUND');
    }

    // Generate fresh signed GET URL with short TTL (900 seconds)
    const downloadUrl = await s3Storage.generateReportDownloadUrl({
      fileKey: report.pdfUrl,
      expiresIn: 900,
    });

    return {
      reportId: report._id,
      bookingId: report.bookingId,
      downloadUrl,
      summaryHtml: report.summaryHtml,
      authoredBy: report.authoredBy,
      approvedBy: report.approvedBy,
      recommendedDoctor: report.recommendedDoctorId,
      recommendationReason: report.recommendationReason,
      editHistory: report.editHistory,
      publishedAt: report.createdAt,
      updatedAt: report.updatedAt,
    };
  }
}

export const reportService = new ReportService();
export default reportService;
