import test from 'node:test';
import assert from 'node:assert';
import { createApiClient } from '@pathcare/api';
import { resolveCheckoutPriceWith, StalePriceError } from './checkout.js';
import { getBundledTestBySlug } from './bundledCatalogue.js';

/**
 * Baskets.
 *
 * A patient booking a checkup, a blood test and a scan should get one
 * collection, not three. The pricing for that lives on the server — see
 * backend/tests/integration/cartQuote.test.js, which checks it against a real
 * database and against what createBooking actually charges.
 *
 * What is left for this module, and what these tests cover, is everything
 * around the money: that the whole basket reaches the server, that the
 * server's answer is passed through without being second-guessed, and that a
 * basket with anything wrong in it fails rather than being partly booked.
 */

function ok(data, config) {
  return { data, status: 200, statusText: 'OK', headers: {}, config };
}

function line(slug, name, category, basePrice, turnaroundHrs, homeCollectionAvailable = true) {
  return { id: `id-${slug}`, slug, name, category, basePrice, turnaroundHrs, homeCollectionAvailable };
}

const MIXED_QUOTE = {
  lines: [
    line('full-body-checkup-essential', 'Full Body Checkup — Essential', 'package', 1499, 8),
    line('complete-blood-count-cbc', 'Complete Blood Count (CBC)', 'single', 299, 6),
    line('ultrasound-whole-abdomen', 'Ultrasound — Whole Abdomen', 'imaging', 1200, 4, false),
  ],
  // As in checkout.test.js, the total is unreachable from the other fields:
  // round(2998 * 0.5) is 1499, not 2548. Internally consistent, locally
  // underivable — so the pass-through assertions cannot be satisfied by a
  // client that does its own arithmetic.
  subtotal: 2998,
  labAdjustment: -450,
  total: 2548,
  lab: { id: 'lab-himalaya', name: 'Himalaya Medicare', priceMultiplier: 0.5 },
  mode: 'visit',
  modeReason:
    'Ultrasound — Whole Abdomen needs lab equipment, so this booking is a lab visit. Everything in it is collected at the centre.',
  overlapWarning:
    'Your cart has a checkup package alongside individual tests. Packages already cover several parameters, so some may be repeated — and repeated items are charged separately.',
  turnaroundHrs: 8,
  totalPending: false,
  currency: 'INR',
};

function stubClient({ quote = MIXED_QUOTE, onQuoteBody } = {}) {
  const seen = [];
  const client = createApiClient('http://api.test');

  client.defaults.adapter = async (config) => {
    if (config.url === '/api/cart/quote') {
      seen.push('quote');
      onQuoteBody?.(JSON.parse(config.data));
      return ok({ data: quote }, config);
    }
    throw new Error(`unexpected request: ${config.url}`);
  };

  return { client, seen };
}

const BASKET = [
  { slug: 'full-body-checkup-essential' },
  { slug: 'complete-blood-count-cbc' },
  { slug: 'ultrasound-whole-abdomen' },
];
const ARGS = { labCenterId: 'lab-himalaya', lat: 30.31, lng: 78.03 };

test('sends the whole basket in one request', async () => {
  let sent = null;
  const { client, seen } = stubClient({ onQuoteBody: (body) => { sent = body; } });

  await resolveCheckoutPriceWith({ tests: BASKET, ...ARGS }, client);

  // One call, not one per item — and in the order the patient built it.
  assert.deepStrictEqual(seen, ['quote']);
  assert.deepStrictEqual(sent.items, [
    'full-body-checkup-essential',
    'complete-blood-count-cbc',
    'ultrasound-whole-abdomen',
  ]);
});

test('passes the server figures through untouched', async () => {
  const { client } = stubClient({});

  const live = await resolveCheckoutPriceWith({ tests: BASKET, ...ARGS }, client);

  assert.strictEqual(live.subtotal, 2998);
  assert.strictEqual(live.labAdjustment, -450);
  assert.strictEqual(live.price, 2548);
  assert.notStrictEqual(live.price, 1499); // round(2998 * 0.5), the local answer
  assert.strictEqual(live.tests.length, 3);
  // If this module ever starts deriving the total again, this is the assertion
  // that should catch it: 2998 + (-450) is the server's arithmetic, not ours.
  assert.strictEqual(live.subtotal + live.labAdjustment, live.price);
});

test('carries the mode and the reason the server gave for it', async () => {
  const { client } = stubClient({});

  const live = await resolveCheckoutPriceWith({ tests: BASKET, ...ARGS }, client);

  // The client neither decides this nor words it. A basket silently becoming a
  // lab visit reads as a bug; naming the item that forced it does not.
  assert.strictEqual(live.mode, 'visit');
  assert.match(live.modeReason, /Ultrasound/);
  assert.match(live.modeReason, /lab visit/i);
});

test('carries the overlap warning rather than dropping a line', async () => {
  const { client } = stubClient({});

  const live = await resolveCheckoutPriceWith({ tests: BASKET, ...ARGS }, client);

  assert.match(live.overlapWarning, /repeated/i);
  // Both the package and the test it may cover are still in the basket and
  // both are charged — the warning is disclosure, not a silent correction.
  assert.strictEqual(live.tests.length, 3);
});

test('quotes the slowest turnaround the server reported', async () => {
  const { client } = stubClient({});

  const live = await resolveCheckoutPriceWith({ tests: BASKET, ...ARGS }, client);

  // The booking is finished when the last result is in.
  assert.strictEqual(live.turnaroundHrs, 8);
});

test('one stale entry rejects the whole basket, before any request', async () => {
  const bundled = getBundledTestBySlug('complete-blood-count-cbc');
  const { client, seen } = stubClient({});

  await assert.rejects(
    () => resolveCheckoutPriceWith({ tests: [BASKET[0], bundled], ...ARGS }, client),
    StalePriceError
  );

  // No partial checkout. Booking the good item at a price the patient did not
  // agree to is worse than failing.
  assert.deepStrictEqual(seen, []);
});

test('an item with no slug rejects the whole basket', async () => {
  const { client, seen } = stubClient({});

  await assert.rejects(
    () => resolveCheckoutPriceWith({ tests: [BASKET[0], { name: 'mystery' }], ...ARGS }, client),
    StalePriceError
  );
  assert.deepStrictEqual(seen, []);
});

test('an empty basket is refused', async () => {
  const { client, seen } = stubClient({});

  await assert.rejects(
    () => resolveCheckoutPriceWith({ tests: [], ...ARGS }, client),
    StalePriceError
  );
  assert.deepStrictEqual(seen, []);
});

test('a single test still works through the old singular shape', async () => {
  // The test-detail screen books one test and passes `test`, not `tests`.
  const single = {
    ...MIXED_QUOTE,
    lines: [MIXED_QUOTE.lines[1]],
    subtotal: 299,
    labAdjustment: -45,
    total: 254,
    mode: 'home',
    modeReason: null,
    overlapWarning: null,
    turnaroundHrs: 6,
  };
  const { client } = stubClient({ quote: single });

  const live = await resolveCheckoutPriceWith(
    { test: { slug: 'complete-blood-count-cbc' }, ...ARGS },
    client
  );

  assert.strictEqual(live.price, 254);
  assert.strictEqual(live.test.slug, 'complete-blood-count-cbc');
  assert.strictEqual(live.tests.length, 1);
});
