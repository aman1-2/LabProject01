import express from 'express';
import {
  createAppointment,
  listPatientAppointments,
} from '../../controllers/appointmentController.js';
import { isAuthenticated } from '../../middlewares/authMiddleware.js';

const router = express.Router();

// All appointment routes require authentication
router.use(isAuthenticated);

// POST /api/appointments — book doctor consultation slot (strictly NO payment processing)
router.post('/', createAppointment);

// GET /api/appointments — list current patient's appointments
router.get('/', listPatientAppointments);

export default router;
