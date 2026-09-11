import express from 'express';
import {
  getOverview,
  triggerRollup,
  getBookings,
  getLabs,
  verifyLab,
  getRiders,
  getDoctors,
  verifyDoctor,
  getFeedback,
  createLabCentre,
  createDoctorAccount,
  createRiderAccount,
  createLabAdminAccount,
} from '../../controllers/adminController.js';
import {
  getReferralLeads,
  updateReferralLead,
} from '../../controllers/referralLeadController.js';
import {
  isAuthenticated,
  hasRole,
  requirePasswordChanged,
} from '../../middlewares/authMiddleware.js';
import { validateBody } from '../../middlewares/validateRequest.js';
import {
  createLabCentreSchema,
  createDoctorAccountSchema,
  createRiderAccountSchema,
  createLabAdminAccountSchema,
} from '@pathcare/validators';

const router = express.Router();

router.use(isAuthenticated);
// A staff member whose password was set by an admin must choose their own
// before doing anything else. Enforced server-side: a flag the interface is
// trusted to honour is a suggestion, not a control.
router.use(requirePasswordChanged);

// ── Routes a lab admin may also reach ───────────────────────────────────────
// The lab console's referral pipeline (LabConsolePage.jsx:107,125,144) calls
// these. Declared BEFORE the super_admin gate below so they remain reachable.
// NOTE: ExternalReferralMention carries no labCenterId, so this data is
// platform-wide and is NOT scoped to the admin's own centre. See AUDIT_REPORT.
router.get('/referral-leads', hasRole('super_admin', 'lab_admin'), getReferralLeads);
router.patch('/referral-leads/:id', hasRole('super_admin', 'lab_admin'), updateReferralLead);

// ── Everything below is SUPER ADMIN ONLY ────────────────────────────────────
// Previously the whole router admitted lab_admin, exposing every booking on the
// platform, revenue, the rider and doctor rosters and all feedback — and letting
// any lab admin verify their own centre or a competitor's (CONTEXT §1 role table).
router.use(hasRole('super_admin'));

// Business Overview: today live + historical DailyStats
router.get('/overview', getOverview);

// Nightly rollup manual / cron trigger
router.post('/rollup', triggerRollup);

// All platform bookings
router.get('/bookings', getBookings);

// Lab centres management and verification
// POST /api/admin/labs — create a lab centre. New centres are unverified and
// cannot receive bookings until someone verifies them below.
router.post('/labs', validateBody(createLabCentreSchema), createLabCentre);
router.get('/labs', getLabs);
router.patch('/labs/:id/verify', verifyLab);

// Riders management
// POST /api/admin/riders — create a phlebotomist login attached to a centre.
router.post('/riders', validateBody(createRiderAccountSchema), createRiderAccount);
router.get('/riders', getRiders);

// POST /api/admin/lab-admins — create a lab desk login for a centre.
router.post('/lab-admins', validateBody(createLabAdminAccountSchema), createLabAdminAccount);

// Partner doctors management and verification
// POST /api/admin/doctors — create a doctor. Created inactive: the
// patient-facing directory lists active doctors only, so a new one is invisible
// until an admin verifies them.
router.post('/doctors', validateBody(createDoctorAccountSchema), createDoctorAccount);
router.get('/doctors', getDoctors);
router.patch('/doctors/:id/verify', verifyDoctor);

// Patient feedback
router.get('/feedback', getFeedback);

// (External referral recruitment leads are declared above the super_admin gate.)

export default router;
