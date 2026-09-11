import express from 'express';
import {
  getDoctors,
  getDoctorById,
  getSpecialties,
  getDoctorDashboard,
} from '../../controllers/doctorController.js';
import { isAuthenticated, hasRole } from '../../middlewares/authMiddleware.js';

const router = express.Router();

// GET /api/doctors/specialties — list distinct specialties for filter chips
router.get('/specialties', getSpecialties);

// GET /api/doctors/dashboard (and /api/doctor/dashboard) — counts only, zero money.
// Exposes referred patients' names and phone numbers, so it is restricted to the
// doctor themselves (resolved from the token) and to super admins.
router.get(
  '/dashboard',
  isAuthenticated,
  hasRole('doctor', 'super_admin'),
  getDoctorDashboard
);

// GET /api/doctors — list doctors (filtered by specialty/search, ranked by suitability then tier)
router.get('/', getDoctors);

// GET /api/doctors/:id — get doctor profile details
router.get('/:id', getDoctorById);

export default router;
