import crypto from 'node:crypto';
import razorpayConfig from '../config/razorpayConfig.js';
import logger from './logger.js';

export class RazorpayClient {
  constructor(config = razorpayConfig) {
    this.keyId = config.keyId;
    this.keySecret = config.keySecret;
    this.webhookSecret = config.webhookSecret;
  }

  /**
   * Verify Razorpay Webhook signature over the RAW request body.
   * Conforms to PATHCARE_CONTEXT.md §3.3 & §6.2.
   *
   * @param {string|Buffer} rawBody - Raw body buffer/string before JSON parsing
   * @param {string} signature - Received 'x-razorpay-signature' header
   * @param {string} [customSecret] - Optional override for secret
   * @returns {boolean} True if signature is cryptographically valid
   */
  verifyWebhookSignature(rawBody, signature, customSecret) {
    if (!rawBody || !signature) {
      return false;
    }

    const secret = customSecret || this.webhookSecret;
    if (!secret) {
      logger.error('Razorpay webhook secret is missing');
      return false;
    }

    try {
      const bodyBuffer = Buffer.isBuffer(rawBody) ? rawBody : Buffer.from(rawBody, 'utf8');
      const expectedSignature = crypto
        .createHmac('sha256', secret)
        .update(bodyBuffer)
        .digest('hex');

      const expectedBuffer = Buffer.from(expectedSignature, 'utf8');
      const signatureBuffer = Buffer.from(signature, 'utf8');

      if (expectedBuffer.length !== signatureBuffer.length) {
        return false;
      }

      return crypto.timingSafeEqual(expectedBuffer, signatureBuffer);
    } catch (err) {
      logger.error('Error verifying Razorpay webhook signature', { error: err.message });
      return false;
    }
  }

  /**
   * Create an order via Razorpay Orders API
   * @param {Object} params
   * @param {number} params.amountPaise - Amount in Paise (INR * 100)
   * @param {string} [params.currency='INR']
   * @param {string} params.receipt - Booking ID
   * @param {Object} [params.notes={}]
   * @returns {Promise<Object>}
   */
  async createOrder({ amountPaise, currency = 'INR', receipt, notes = {} }) {
    const authHeader = Buffer.from(`${this.keyId}:${this.keySecret}`).toString('base64');

    const response = await fetch('https://api.razorpay.com/v1/orders', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Basic ${authHeader}`,
      },
      body: JSON.stringify({
        amount: amountPaise,
        currency,
        receipt: receipt.toString().slice(-40),
        notes,
      }),
    });

    if (!response.ok) {
      const errorBody = await response.text();
      logger.error('Razorpay order creation failed', {
        status: response.status,
        body: errorBody,
      });
      throw new Error(`Razorpay Order Creation Failed: ${errorBody}`);
    }

    return response.json();
  }

  /**
   * Create a refund via Razorpay Payments API
   * @param {Object} params
   * @param {string} params.paymentId - Gateway Payment ID
   * @param {number} params.amountPaise - Refund amount in Paise
   * @param {Object} [params.notes={}]
   * @returns {Promise<Object>}
   */
  async createRefund({ paymentId, amountPaise, notes = {} }) {
    const authHeader = Buffer.from(`${this.keyId}:${this.keySecret}`).toString('base64');

    const response = await fetch(`https://api.razorpay.com/v1/payments/${paymentId}/refund`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Basic ${authHeader}`,
      },
      body: JSON.stringify({
        amount: amountPaise,
        notes,
      }),
    });

    if (!response.ok) {
      const errorBody = await response.text();
      logger.error('Razorpay refund failed', {
        paymentId,
        status: response.status,
        body: errorBody,
      });
      throw new Error(`Razorpay Refund Failed: ${errorBody}`);
    }

    return response.json();
  }
}

export const razorpayClient = new RazorpayClient();
export default razorpayClient;
