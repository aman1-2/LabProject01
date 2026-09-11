import test from 'node:test';
import assert from 'node:assert';
import { createApiClient } from '@pathcare/api';
import {
  resolveCheckoutPriceWith,
  startPaymentWith,
  startPayment,
  StalePriceError,
} from './checkout.js';
import { getBundledTestBySlug } from './bundledCatalogue.js';

/**
 * The price path.
 *
 * CONTEXT §7.3 — "Never charge using a cached or pre-bundled price. Re-fetch
 * and confirm server-side at checkout." The bundle ships real prices so the
 * first screen is not blank; the risk is one surviving into a charge after the
 * catalogue has moved on.
 *
 * WHAT THESE TESTS COVER, AND WHAT THEY DELIBERATELY DO NOT
 *
 * This module no longer computes a total — it POSTs the basket to
 * /api/cart/quote and returns what comes back. So the arithmetic is not tested
 * here any more: asserting sums against a stubbed response would only prove
 * the stub can add up. It is tested where it happens, against a real database,
 * in backend/tests/integration/cartQuote.test.js — including that the quote
 * equals what createBooking charges.
 *
 * What IS this module's responsibility, and is covered below:
 *   - refusing stale input before any request leaves the device;
 *   - sending only slugs, never a price;
 *   - returning the server's numbers unaltered;
 *   - failing loudly, never falling back to a locally computed figure.
 */

function ok(data, config) {
  return { data, status: 200, statusText: 'OK', headers: {}, config };
}

const QUOTE = {
  lines: [
    {
      id: 'test-1',
      slug: 'complete-blood-count-cbc',
      name: 'Complete Blood Count (CBC)',
      category: 'single',
      basePrice: 299,
      turnaroundHrs: 6,
      homeCollectionAvailable: true,
    },
  ],
  // Deliberately NOT derivable from the other fields: round(299 * 1.1) is 329,
  // not 500. A client that recomputed the total locally would produce 329 and
  // fail the pass-through assertion below — which is the whole point of these
  // numbers. They are internally consistent (299 + 201 = 500) but unreachable
  // by any arithmetic this module could do.
  subtotal: 299,
  labAdjustment: 201,
  total: 500,
  lab: { id: 'lab-sunrise', name: 'Sunrise Diagnostics', priceMultiplier: 1.1 },
  mode: 'home',
  modeReason: null,
  overlapWarning: null,
  turnaroundHrs: 6,
  totalPending: false,
  currency: 'INR',
};

/** A client whose adapter answers the quote and payment calls, recording them. */
function stubClient({ quote = QUOTE, order, onQuoteBody, onPaymentBody, quoteError } = {}) {
  const seen = [];
  const client = createApiClient('http://api.test');

  client.defaults.adapter = async (config) => {
    if (config.url === '/api/cart/quote') {
      seen.push('quote');
      onQuoteBody?.(JSON.parse(config.data));
      if (quoteError) throw quoteError;
      return ok({ data: quote }, config);
    }
    if (config.url === '/api/payments/create-order') {
      const body = JSON.parse(config.data);
      seen.push('create-order');
      onPaymentBody?.(body);
      return ok({ data: order }, config);
    }
    throw new Error(`unexpected request: ${config.url}`);
  };

  return { client, seen };
}

const ARGS = { labCenterId: 'lab-sunrise', lat: 30.31, lng: 78.03 };

test('refuses to check out from a bundled (stale) catalogue entry', async () => {
  const bundledTest = getBundledTestBySlug('complete-blood-count-cbc');
  assert.strictEqual(bundledTest.isStale, true);

  const { client, seen } = stubClient({});

  await assert.rejects(
    () => resolveCheckoutPriceWith({ test: bundledTest, ...ARGS }, client),
    (err) => {
      assert.ok(err instanceof StalePriceError);
      assert.strictEqual(err.code, 'STALE_PRICE_REFUSED');
      return true;
    }
  );

  // Refused before making any request at all — the bundled price never even
  // got the chance to be compared against a live one.
  assert.deepStrictEqual(seen, []);
});

test('asks the server for the price, sending only slugs', async () => {
  let sent = null;
  const { client, seen } = stubClient({ onQuoteBody: (body) => { sent = body; } });

  await resolveCheckoutPriceWith({ test: { slug: 'complete-blood-count-cbc' }, ...ARGS }, client);

  assert.deepStrictEqual(seen, ['quote']);
  // No amount, no price, no total. A client proposing what it pays is the
  // defect CONTEXT §3.2 exists to prevent.
  assert.deepStrictEqual(sent, {
    items: ['complete-blood-count-cbc'],
    labCenterId: 'lab-sunrise',
    lat: 30.31,
    lng: 78.03,
  });
});

test('returns the server total unaltered, never a locally derived one', async () => {
  const { client } = stubClient({});

  const live = await resolveCheckoutPriceWith(
    { test: { slug: 'complete-blood-count-cbc' }, ...ARGS },
    client
  );

  // 500 is the server's figure. It is not the subtotal (299) and it is not
  // round(299 * 1.1) = 329 either — nothing this module can compute produces
  // it, so passing this proves the number came from the server.
  assert.strictEqual(live.price, 500);
  assert.notStrictEqual(live.price, 329);
  assert.strictEqual(live.subtotal, 299);
  assert.strictEqual(live.labName, 'Sunrise Diagnostics');
  assert.strictEqual(live.turnaroundHrs, 6);
  assert.strictEqual(live.isStale, false);
});

test('a total the server would not commit to is refused', async () => {
  // No lab chosen means no multiplier, so the endpoint returns a subtotal and
  // a null total. Presenting that subtotal as the price would invent a number.
  const { client } = stubClient({
    quote: { ...QUOTE, total: null, totalPending: true, lab: null, labAdjustment: null },
  });

  await assert.rejects(
    () => resolveCheckoutPriceWith({ test: { slug: 'complete-blood-count-cbc' }, ...ARGS }, client),
    StalePriceError
  );
});

test('refuses before asking when no lab has been chosen', async () => {
  const { client, seen } = stubClient({});

  await assert.rejects(
    () =>
      resolveCheckoutPriceWith(
        { test: { slug: 'complete-blood-count-cbc' }, labCenterId: null, lat: 30.31, lng: 78.03 },
        client
      ),
    StalePriceError
  );
  assert.deepStrictEqual(seen, []);
});

test('a network failure surfaces as an error, never as a fallback price', async () => {
  const client = createApiClient('http://api.test');
  client.defaults.adapter = async () => {
    const error = new Error('Network Error');
    error.config = {};
    throw error;
  };

  // Not knowing the price must fail loudly. Silently charging a bundled number
  // here is exactly the defect §7.3 forbids.
  await assert.rejects(
    () => resolveCheckoutPriceWith({ test: { slug: 'complete-blood-count-cbc' }, ...ARGS }, client),
    (err) => {
      assert.ok(!(typeof err?.price === 'number'), 'must not resolve to a price');
      return true;
    }
  );
});

test('a test the catalogue no longer has rejects the basket', async () => {
  const notFound = new Error('Test not found');
  notFound.status = 404;
  const { client } = stubClient({ quoteError: notFound });

  await assert.rejects(
    () => resolveCheckoutPriceWith({ test: { slug: 'retired-test' }, ...ARGS }, client),
    (err) => {
      assert.ok(!(typeof err?.price === 'number'), 'must not resolve to a price');
      return true;
    }
  );
});

test('a payment order is created from the booking id alone', async () => {
  let sentBody = null;
  const { client } = stubClient({
    order: { id: 'order_x', amount: 32900, currency: 'INR', keyId: 'rzp_test_x' },
    onPaymentBody: (body) => {
      sentBody = body;
    },
  });

  const order = await startPaymentWith('booking-123', client);

  // No amount, no price, no test id — the server computes what to charge from
  // the booking it already holds (CONTEXT §3.2).
  assert.deepStrictEqual(sentBody, { bookingId: 'booking-123' });
  assert.ok(!('amount' in sentBody));
  assert.strictEqual(order.amount, 32900);
});

test('a payment order cannot be created without a booking', async () => {
  await assert.rejects(() => startPayment(null), StalePriceError);
});
