import express from 'express';
import {
  createBooking,
  listBookings,
  getBookingById,
  updateBookingStatus,
  rescheduleBooking,
  cancelBooking,
} from '../../controllers/bookingController.js';
import { isAuthenticated, hasRole } from '../../middlewares/authMiddleware.js';

const router = express.Router();

// All booking routes require authenticated patient
router.use(isAuthenticated);

// POST /api/bookings (and /api/v1/bookings) — create new booking with Idempotency-Key
router.post('/', createBooking);

// GET /api/bookings — list patient's own bookings
router.get('/', listBookings);

// GET /api/bookings/:id — get single booking details (404 if unowned)
router.get('/:id', getBookingById);

// PATCH /api/bookings/:id/status — transition status with state machine validation.
// Role gate is defence in depth; statusTransitionService independently verifies
// that the actor is entitled to this specific booking and returns 404 if not.
router.patch(
  '/:id/status',
  hasRole('patient', 'rider', 'lab_admin', 'super_admin'),
  updateBookingStatus
);

// PATCH /api/bookings/:id/reschedule — free reschedule to a future slot
router.patch('/:id/reschedule', rescheduleBooking);

// PATCH /api/bookings/:id/cancel — cancel booking with config-driven refund & rider release
router.patch('/:id/cancel', cancelBooking);

export default router;
