// backend/src/config/razorpayConfig.js
import dotenv from 'dotenv';
import { resolveSecret } from './secretsConfig.js';

dotenv.config();

/**
 * Razorpay credentials.
 *
 * Exposed as getters so each value is resolved on use rather than frozen at
 * import time. There are NO hardcoded fallbacks: previously an unset
 * RAZORPAY_WEBHOOK_SECRET meant webhook HMAC was verified against a string
 * committed to this repository, which would let anyone forge a signed
 * `payment.captured` and mark a booking paid without paying.
 */
export const razorpayConfig = {
  get keyId() {
    return resolveSecret('RAZORPAY_KEY_ID');
  },
  get keySecret() {
    return resolveSecret('RAZORPAY_KEY_SECRET');
  },
  get webhookSecret() {
    return resolveSecret('RAZORPAY_WEBHOOK_SECRET');
  },
};

export default razorpayConfig;
