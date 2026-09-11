import razorpayConfig from '../config/razorpayConfig.js';
import { AppError } from '../utils/AppError.js';
import logger from '../utils/logger.js';

/**
 * Razorpay Subscriptions + UPI AutoPay mandate.
 *
 * Calls the REST API directly with fetch and Basic auth, matching
 * utils/razorpayClient.js. The `razorpay` SDK is deliberately not added: the
 * repo already talks to this API without it, and a second way of reaching the
 * same gateway is a second thing to keep in step.
 *
 * Kept separate from subscriptionService so the business rules are testable
 * without a gateway, and every outbound call lives in one file.
 *
 * NOTE (the sibling of CONTEXT §6.2's rule): nothing here may run inside a
 * database transaction. A mandate call is an external HTTP round trip, and a
 * Mongo transaction held open across one is a long-lived lock that will time
 * out. Callers record intent, call this, then record the outcome.
 */

const API_BASE = 'https://api.razorpay.com/v1';

function authHeader() {
  return Buffer.from(`${razorpayConfig.keyId}:${razorpayConfig.keySecret}`).toString('base64');
}

/**
 * Test seam. Suites install a stub so the money rules can be exercised without
 * network access; production never calls this.
 */
let transport = null;
export function __setSubscriptionTransportForTests(stub) {
  transport = stub;
}

async function callGateway(path, { method = 'POST', body } = {}) {
  if (transport) {
    return transport({ path, method, body });
  }

  const response = await fetch(`${API_BASE}${path}`, {
    method,
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Basic ${authHeader()}`,
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });

  if (!response.ok) {
    const errorBody = await response.text();
    logger.error('Razorpay subscription API call failed', {
      path,
      status: response.status,
      body: errorBody,
    });
    throw new AppError(
      'The payment provider could not complete that request',
      502,
      'GATEWAY_SUBSCRIPTION_FAILED'
    );
  }

  return response.json();
}

/** Razorpay periods, derived from our day-based interval. */
export function toRazorpayPeriod(frequencyDays) {
  if (frequencyDays % 365 === 0) return { period: 'yearly', interval: frequencyDays / 365 };
  if (frequencyDays % 30 === 0) return { period: 'monthly', interval: frequencyDays / 30 };
  if (frequencyDays % 7 === 0) return { period: 'weekly', interval: frequencyDays / 7 };
  return { period: 'daily', interval: frequencyDays };
}

/**
 * A plan describes amount and cadence; a subscription binds a customer to one.
 */
export async function createPlan({ name, amount, frequencyDays }) {
  const { period, interval } = toRazorpayPeriod(frequencyDays);

  return callGateway('/plans', {
    body: {
      period,
      interval,
      item: {
        name,
        // Razorpay works in paise. Rounding rather than trusting a float keeps
        // the authorised amount exact.
        amount: Math.round(amount * 100),
        currency: 'INR',
      },
    },
  });
}

/**
 * Creates the subscription and returns the mandate authorisation URL.
 *
 * `total_count` is the maximum number of cycles the mandate covers — a ceiling
 * Razorpay requires, not a promise to charge that many times. Cancelling early
 * is always allowed.
 */
export async function createGatewaySubscription({ planId, totalCount, notes = {} }) {
  return callGateway('/subscriptions', {
    body: {
      plan_id: planId,
      total_count: totalCount,
      customer_notify: 1,
      notes,
    },
  });
}

export async function pauseGatewaySubscription(razorpaySubscriptionId) {
  return callGateway(`/subscriptions/${razorpaySubscriptionId}/pause`, {
    body: { pause_at: 'now' },
  });
}

export async function resumeGatewaySubscription(razorpaySubscriptionId) {
  return callGateway(`/subscriptions/${razorpaySubscriptionId}/resume`, {
    body: { resume_at: 'now' },
  });
}

/**
 * Stops it immediately. A patient asking to cancel expects no further debits,
 * not one more at the end of the cycle.
 */
export async function cancelGatewaySubscription(razorpaySubscriptionId) {
  return callGateway(`/subscriptions/${razorpaySubscriptionId}/cancel`, {
    body: { cancel_at_cycle_end: 0 },
  });
}

/** Used by reconciliation to detect mandates changed outside the app. */
export async function fetchGatewaySubscription(razorpaySubscriptionId) {
  try {
    return await callGateway(`/subscriptions/${razorpaySubscriptionId}`, { method: 'GET' });
  } catch (error) {
    logger.warn('Razorpay subscription fetch failed', { error: error.message });
    return null;
  }
}

export default {
  createPlan,
  createGatewaySubscription,
  pauseGatewaySubscription,
  resumeGatewaySubscription,
  cancelGatewaySubscription,
  fetchGatewaySubscription,
  toRazorpayPeriod,
  __setSubscriptionTransportForTests,
};
