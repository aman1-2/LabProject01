// backend/src/routes/v1/labAdminRoutes.js
import express from 'express';
import { isAuthenticated, hasRole } from '../../middlewares/authMiddleware.js';
import { validateQuery } from '../../middlewares/validateRequest.js';
import { labQueueQuerySchema } from '@pathcare/validators';
import {
  getLabQueue,
  confirmArrival,
  confirmCash,
  getProfile,
} from '../../controllers/labAdminController.js';

const router = express.Router();

// Apply auth + labAdmin role gating to all routes
router.use(isAuthenticated, hasRole('labAdmin', 'superAdmin'));

// GET /api/lab/queue — this centre's bookings only
router.get('/queue', validateQuery(labQueueQuerySchema), getLabQueue);

// PATCH /api/lab/bookings/:id/confirm — confirms lab-visit arrival
router.patch('/bookings/:id/confirm', confirmArrival);

// POST /api/lab/bookings/:id/cash-received — confirms cash at the centre
router.post('/bookings/:id/cash-received', confirmCash);

// GET /api/lab/profile — accreditation status, read-only
router.get('/profile', getProfile);

export default router;
