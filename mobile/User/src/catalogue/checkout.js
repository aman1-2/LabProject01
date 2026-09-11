import { apiClient, fetchCartQuote, createPaymentOrder } from '@pathcare/api';

/**
 * The price path.
 *
 * CONTEXT §7.3: "Never charge using a cached or pre-bundled price. Re-fetch and
 * confirm server-side at checkout." The bundled catalogue exists so the first
 * screen is not blank; it must never be the number a patient is charged.
 *
 * This module is the only place the app resolves a price for checkout, and it
 * refuses to work from anything stale. That refusal is a thrown error rather
 * than a convention: a comment can be ignored, a throw cannot.
 */

export class StalePriceError extends Error {
  constructor(message) {
    super(message);
    this.name = 'StalePriceError';
    this.code = 'STALE_PRICE_REFUSED';
  }
}

/**
 * Confirms the live price for a basket, immediately before payment.
 *
 * THIS FUNCTION NO LONGER COMPUTES ANYTHING
 *
 * It used to fetch each test, fetch the labs, sum the base prices and apply
 * the multiplier itself — an exact hand-maintained copy of the server's
 * `calculateBookingPrice`. Two copies of one arithmetic is a bug waiting for
 * whichever is edited first, and the failure mode is the worst kind: a quote a
 * rupee off the debit, which a patient cannot distinguish from being
 * overcharged.
 *
 * It now POSTs the basket to /api/cart/quote and returns what comes back. The
 * server prices it with the same function the booking charges with, so the
 * number shown here and the amount taken cannot disagree by construction.
 *
 * EVERY GUARD STILL APPLIES, AND STILL THROWS
 *
 * §7.3 forbids charging from a cached or pre-bundled price. A bundled entry is
 * refused before any request is made; a basket the server will not price — a
 * test that no longer exists, a lab that has gone away, a network that is
 * down — throws rather than resolving. Nothing here ever falls back to a
 * locally computed figure, because a figure nothing stands behind is worse
 * than an error.
 *
 * There is no partial checkout either: any bad item rejects the whole basket.
 * Booking three of the four things someone selected, at a price they did not
 * agree to, is worse than failing.
 *
 * `client` exists so this can be driven through a stubbed transport in tests.
 */
export async function resolveCheckoutPriceWith(
  { test, tests, labCenterId, lat, lng },
  client = apiClient
) {
  // One test or many — the rest of this function only knows about baskets.
  const requested = (Array.isArray(tests) && tests.length > 0 ? tests : [test]).filter(Boolean);

  if (requested.length === 0) {
    throw new StalePriceError('At least one test is required to confirm a price.');
  }

  for (const item of requested) {
    if (item?.isStale) {
      throw new StalePriceError(
        'Refusing to check out from a bundled catalogue entry. Re-fetch the test before payment.'
      );
    }
    if (!item?.slug) {
      throw new StalePriceError('A test slug is required to confirm the live price.');
    }
  }

  if (!labCenterId) {
    // Without a centre the server returns a subtotal and no total, because the
    // same test costs different amounts at different labs. Presenting that
    // subtotal as the price would be inventing a number.
    throw new StalePriceError('Choose a lab centre before confirming a price.');
  }

  const quote = await fetchCartQuote(
    {
      items: requested.map((item) => item.slug),
      labCenterId,
      lat,
      lng,
    },
    client
  );

  if (!quote || typeof quote.total !== 'number') {
    throw new StalePriceError(
      'We could not confirm the price for this lab just now. Please try again.'
    );
  }

  const lines = quote.lines ?? [];

  return {
    price: quote.total,
    subtotal: quote.subtotal,
    labAdjustment: quote.labAdjustment,
    labName: quote.lab?.name ?? null,
    turnaroundHrs: quote.turnaroundHrs,
    // The server decides the mode for a basket and says which item forced it;
    // the screen shows that sentence rather than wording one of its own.
    mode: quote.mode,
    modeReason: quote.modeReason ?? null,
    overlapWarning: quote.overlapWarning ?? null,
    // Kept singular for the screens that book one test; `tests` is the basket.
    test: lines[0] ?? null,
    tests: lines,
    isStale: false,
  };
}

export function resolveCheckoutPrice(args) {
  return resolveCheckoutPriceWith(args, apiClient);
}

/**
 * Creates the payment order.
 *
 * Sends ONLY the bookingId. The server computes the amount from the booking it
 * already persisted, so no client-supplied number exists anywhere on the money
 * path (CONTEXT §3.2).
 */
export async function startPaymentWith(bookingId, client = apiClient) {
  if (!bookingId) {
    throw new StalePriceError('A booking must exist before a payment order can be created.');
  }
  return createPaymentOrder(bookingId, client);
}

export function startPayment(bookingId) {
  return startPaymentWith(bookingId, apiClient);
}
