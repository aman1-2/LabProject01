// backend/src/controllers/reportController.js
import { reportService } from '../services/reportService.js';
import { uploadUrlSchema, publishReportSchema } from '@pathcare/validators';

/**
 * Generate presigned S3 PUT URL for uploading private report PDF
 * POST /api/lab/reports/:bookingId/upload-url
 */
export async function getReportUploadUrl(req, res, next) {
  try {
    const { bookingId } = req.params;
    const userId = req.user?.userId || req.user?.id;
    const userRole = req.user?.role;

    const validated = uploadUrlSchema.parse(req.body || {});

    const result = await reportService.getUploadUrl({
      bookingId,
      labUserId: userId,
      userRole,
      contentType: validated.contentType,
    });

    return res.status(200).json({
      success: true,
      message: 'Presigned upload URL generated successfully',
      data: result,
    });
  } catch (error) {
    next(error);
  }
}

/**
 * Publish diagnostic report with sanitised summary and manual specialist recommendation
 * POST /api/lab/reports/:bookingId/publish
 */
export async function publishLabReport(req, res, next) {
  try {
    const { bookingId } = req.params;
    const userId = req.user?.userId || req.user?.id;
    const userRole = req.user?.role;

    const validated = publishReportSchema.parse(req.body);

    const result = await reportService.publishReport({
      bookingId,
      labUserId: userId,
      userRole,
      pdfKey: validated.pdfKey,
      summaryHtml: validated.summaryHtml,
      recommendedDoctorId: validated.recommendedDoctorId,
      recommendationReason: validated.recommendationReason,
      approvedBy: validated.approvedBy,
    });

    return res.status(200).json({
      success: true,
      message: 'Report published and summary sent to patient',
      data: result,
    });
  } catch (error) {
    next(error);
  }
}

/**
 * Fetch published report for patient with fresh signed download URL
 * GET /api/reports/:bookingId
 */
export async function getReportDetails(req, res, next) {
  try {
    const { bookingId } = req.params;
    const caller = {
      userId: req.user?.userId || req.user?.id,
      role: req.user?.role,
    };

    const reportData = await reportService.getPatientReport({
      bookingId,
      caller,
    });

    return res.status(200).json({
      success: true,
      data: reportData,
    });
  } catch (error) {
    next(error);
  }
}

export default {
  getReportUploadUrl,
  publishLabReport,
  getReportDetails,
};
