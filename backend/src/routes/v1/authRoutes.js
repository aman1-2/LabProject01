import express from 'express';
import {
  handleAvailable,
  signup,
  verifyOtp,
  login,
  loginOtp,
  verifyLoginOtp,
  refresh,
  logout,
  changePassword,
} from '../../controllers/authController.js';
import { validateBody } from '../../middlewares/validateRequest.js';
import {
  signupSchema,
  loginPasswordSchema,
  loginOtpRequestSchema,
  verifyOtpSchema,
  changePasswordSchema,
} from '@pathcare/validators';
import { otpRateLimiter, otpIpRateLimiter, loginRateLimiter } from '../../middlewares/rateLimiter.js';
import { isAuthenticated } from '../../middlewares/authMiddleware.js';

const router = express.Router();

// Handle availability check
router.post('/handle-available', handleAvailable);
router.get('/handle-available', handleAvailable);

// Signup flow
router.post('/signup', otpIpRateLimiter, otpRateLimiter, validateBody(signupSchema), signup);
router.post('/verify-otp', validateBody(verifyOtpSchema), verifyOtp);

// Password login flow
router.post('/login', loginRateLimiter, validateBody(loginPasswordSchema), login);

// OTP login flow
router.post('/login/otp', otpIpRateLimiter, otpRateLimiter, validateBody(loginOtpRequestSchema), loginOtp);
router.post('/login/verify-otp', validateBody(verifyOtpSchema), verifyLoginOtp);

// Session token rotation & revocation
router.post('/refresh', refresh);
router.post('/logout', logout);

// POST /api/auth/change-password — replace your own password.
// Deliberately NOT behind requirePasswordChanged: an account that must change
// its password has to be able to reach the endpoint that changes it.
router.post(
  '/change-password',
  isAuthenticated,
  validateBody(changePasswordSchema),
  changePassword
);

export default router;
