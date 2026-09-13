import express from 'express';
import {
  getReportUploadUrl,
  publishLabReport,
  getReportDetails,
} from '../../controllers/reportController.js';
import { isAuthenticated, hasRole } from '../../middlewares/authMiddleware.js';

const router = express.Router();

// GET /api/reports/:bookingId — patient / owner report view (fresh signed download URL)
router.get('/:bookingId', isAuthenticated, getReportDetails);

// POST /api/reports/:bookingId/upload-url — presigned S3 PUT URL for lab report upload
router.post(
  '/:bookingId/upload-url',
  isAuthenticated,
  hasRole('lab_admin', 'super_admin'),
  getReportUploadUrl
);

// POST /api/reports/:bookingId/publish — publish report with sanitised summary and recommended doctor
router.post(
  '/:bookingId/publish',
  isAuthenticated,
  hasRole('lab_admin', 'super_admin'),
  publishLabReport
);

export const labReportRouter = express.Router();

// Routes mounted at /api/lab/reports
labReportRouter.use(isAuthenticated);
labReportRouter.use(hasRole('lab_admin', 'super_admin'));

// POST /api/lab/reports/:bookingId/upload-url
labReportRouter.post('/:bookingId/upload-url', getReportUploadUrl);

// POST /api/lab/reports/:bookingId/publish
labReportRouter.post('/:bookingId/publish', publishLabReport);

export default router;
