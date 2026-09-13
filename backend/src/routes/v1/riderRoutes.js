import express from 'express';
import {
  updateLocation,
  getJobs,
  acceptJob,
  updateStatus,
  collectJob,
  confirmCashReceived,
  submitJobAtLab,
} from '../../controllers/riderController.js';
import { isAuthenticated, hasRole, requirePasswordChanged } from '../../middlewares/authMiddleware.js';

const router = express.Router();

// All rider endpoints require authentication
router.use(isAuthenticated);
// A staff member whose password was set by an admin must choose their own
// before doing anything else. Enforced server-side: a flag the interface is
// trusted to honour is a suggestion, not a control.
router.use(requirePasswordChanged);

// PATCH /api/rider/location — throttled 1 per 10s, GEOADD to Redis, NOT written to Mongo
router.patch('/location', hasRole('rider', 'super_admin'), updateLocation);

// GET /api/rider/jobs — current assigned job & available jobs in lab center
router.get('/jobs', hasRole('rider', 'super_admin'), getJobs);

// PATCH /api/rider/jobs/:id/accept — atomic claim (409 if taken)
router.patch('/jobs/:id/accept', hasRole('rider', 'super_admin'), acceptJob);

// PATCH /api/rider/status — update rider status ('available' | 'offline')
router.patch('/status', hasRole('rider', 'super_admin'), updateStatus);

// POST /api/rider/jobs/:id/collect — generates barcode, creates Sample, records cold chain, transitions booking
router.post('/jobs/:id/collect', hasRole('rider', 'super_admin'), collectJob);

// POST /api/rider/jobs/:id/cash-received — confirms cash payment, recording who and when
router.post('/jobs/:id/cash-received', hasRole('rider', 'super_admin'), confirmCashReceived);

// POST /api/rider/jobs/:id/submitted — marks handoff at the lab
router.post('/jobs/:id/submitted', hasRole('rider', 'super_admin'), submitJobAtLab);

export default router;

