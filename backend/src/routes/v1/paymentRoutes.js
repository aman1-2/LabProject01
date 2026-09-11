import express from 'express';
import {
  createOrder,
  confirmCash,
  cancelBooking,
} from '../../controllers/paymentController.js';
import { isAuthenticated, hasRole } from '../../middlewares/authMiddleware.js';

const router = express.Router();

// All payment management routes require authentication
router.use(isAuthenticated);

// POST /api/payments/create-order — create Razorpay order for booking
router.post('/create-order', createOrder);

// POST /api/payments/confirm-cash/:bookingId — confirm cash collection (rider or lab_admin)
router.post('/confirm-cash/:bookingId', hasRole('rider', 'lab_admin', 'super_admin'), confirmCash);

// POST /api/payments/cancel/:bookingId — cancel booking and process refund per business rules
router.post('/cancel/:bookingId', cancelBooking);

export default router;
