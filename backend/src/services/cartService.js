import mongoose from 'mongoose';
import { findTestById, findTestBySlug } from '../repositories/testRepository.js';
import labRepository from '../repositories/labRepository.js';
import { calculateBookingPrice } from './pricingService.js';
import { AppError } from '../utils/AppError.js';

/**
 * Pricing a cart.
 *
 * WHY THIS EXISTS
 *
 * The same arithmetic used to live in three places — this service's
 * `calculateBookingPrice`, the website's BookingPage, and the mobile
 * checkout. They agreed only because they were kept in step by hand, and a
 * quote that disagrees with the amount debited is the worst class of bug on a
 * medical product: the patient cannot tell a rounding artefact from being
 * overcharged. This endpoint makes the server the only thing that computes
 * money; the clients render what it returns.
 *
 * HOW THE TOTAL IS COMPUTED
 *
 * `calculateBookingPrice` — the exact function `createBooking` charges with,
 * called with the same arguments. Not a reimplementation of it, not a copy of
 * its formula: the function itself. That is what makes a quote and a charge
 * incapable of disagreeing.
 *
 * WHY LINES CARRY basePrice AND THE LAB ADJUSTMENT IS ONE ROW
 *
 * The server charges `Math.round(sum(basePrice) * multiplier)` — it rounds
 * ONCE, over the whole basket. Multiplying and rounding each line separately
 * and adding those up drifts by a rupee: at a 1.15 multiplier, 99 and 104 come
 * to 233 rounded once and 234 rounded per line. So lines stay at the honest
 * catalogue price and the lab's effect appears as a single adjustment row,
 * which means the column the patient reads actually adds up to what they pay.
 *
 * The divergence is narrow and floating point decides where it falls — 350 and
 * 250 at that same multiplier agree at 690, because 350 * 1.15 is
 * 402.49999999999994 and rounds down. That is exactly why the total is taken
 * from calculateBookingPrice rather than recomputed here to match it.
 *
 * WHAT THIS DELIBERATELY DOES NOT DO
 *
 * It does not detect overlap between a package and a test inside it. A package
 * lists `parameters` as panel names ("CBC (24)") while a single test lists
 * analytes ("Hemoglobin", "RBC Count"); there is no reliable mapping between
 * the two, and guessing one would mean silently dropping something a patient
 * asked for, or silently charging for something they did not. Every item in
 * the cart is one line and every line is charged. This is a product decision,
 * taken knowingly — see `overlapWarning` below, which tells the patient when a
 * cart contains a package alongside other tests so the choice is theirs.
 */

/** Slug or ObjectId — the web cart stores slugs, the app stores ids. */
async function resolveCatalogueItem(reference) {
  let item = null;

  if (mongoose.Types.ObjectId.isValid(reference)) {
    item = await findTestById(reference);
  }
  if (!item) {
    item = await findTestBySlug(reference);
  }
  if (!item) {
    throw new AppError(`'${reference}' is not in our catalogue`, 404, 'TEST_NOT_FOUND');
  }

  return item;
}

/**
 * Resolves the collection mode for a whole basket.
 *
 * A booking has ONE mode. Imaging needs the lab's equipment, so a basket
 * containing any visit-only item is a lab visit in its entirety — and the
 * patient is told which item caused that, because "your booking is a lab
 * visit" with no reason reads as a bug.
 */
export function resolveCartMode(items) {
  const visitOnly = items.filter((item) => item.homeCollectionAvailable === false);

  if (visitOnly.length === 0) {
    return { mode: 'home', modeReason: null, visitOnlyItems: [] };
  }

  const names = visitOnly.map((item) => item.name);
  const subject = names.length === 1 ? names[0] : `${names.slice(0, -1).join(', ')} and ${names.at(-1)}`;

  return {
    mode: 'visit',
    modeReason: `${subject} ${
      names.length === 1 ? 'needs' : 'need'
    } lab equipment, so this booking is a lab visit. Everything in it is collected at the centre.`,
    visitOnlyItems: visitOnly.map((item) => item.slug),
  };
}

/**
 * Prices a cart.
 *
 * @param {object} params
 * @param {string[]} params.items      slugs or ids, in the order the patient added them
 * @param {string} [params.labCenterId] the chosen centre; without one there is no total
 * @param {number} [params.lat]
 * @param {number} [params.lng]
 */
export async function quoteCart({ items, labCenterId = null, lat, lng }) {
  // The same catalogue entry twice is a client bug, not a purchase: dropping it
  // is not the overlap question above, which is about DIFFERENT items whose
  // contents intersect. Order is preserved so the cart reads back the way it
  // was built.
  const seen = new Set();
  const references = items.filter((reference) => {
    if (seen.has(reference)) return false;
    seen.add(reference);
    return true;
  });

  const resolved = [];
  for (const reference of references) {
    resolved.push(await resolveCatalogueItem(reference));
  }

  // A second de-duplication, by id: the same test can arrive once as a slug and
  // once as an ObjectId, and charging twice for that would be indefensible.
  const byId = new Map();
  const catalogueItems = [];
  for (const item of resolved) {
    const id = item._id.toString();
    if (byId.has(id)) continue;
    byId.set(id, true);
    catalogueItems.push(item);
  }

  const { mode, modeReason, visitOnlyItems } = resolveCartMode(catalogueItems);

  const lines = catalogueItems.map((item) => ({
    id: item._id.toString(),
    slug: item.slug,
    name: item.name,
    category: item.category,
    sampleType: item.sampleType,
    basePrice: item.basePrice,
    strikePrice: item.strikePrice ?? null,
    turnaroundHrs: item.turnaroundHrs,
    homeCollectionAvailable: item.homeCollectionAvailable,
    prepInstructions: item.prepInstructions,
  }));

  const subtotal = catalogueItems.reduce((sum, item) => sum + item.basePrice, 0);

  // The booking is only finished when the slowest item is, so a basket's
  // honest turnaround is the maximum, not the first item's or the lab's.
  const turnaroundHrs = catalogueItems.reduce(
    (slowest, item) => Math.max(slowest, item.turnaroundHrs || 0),
    0
  );

  /**
   * A package sitting next to other tests.
   *
   * Adding a test a checkup does NOT cover is the point of the basket: one
   * slot, one phlebotomist, one payment, instead of two bookings. So this
   * leads with that, and mentions the caveat second.
   *
   * It cannot be silent, because we genuinely cannot tell whether an added
   * test is already inside the package — a package lists panel names
   * ("CBC (24)"), a test lists analytes ("Hemoglobin"). Until packages record
   * their constituent tests, the patient is the only one who can check, so the
   * message tells them what to check rather than warning them off.
   */
  const hasPackage = catalogueItems.some((item) => ['package', 'plan'].includes(item.category));
  const packageNames = catalogueItems
    .filter((item) => ['package', 'plan'].includes(item.category))
    .map((item) => item.name);

  const overlapWarning =
    hasPackage && catalogueItems.length > 1
      ? `Everything here is collected in one visit and paid for once. Do check that your extra tests aren't already covered by ${
          packageNames.length === 1 ? packageNames[0] : 'your checkup packages'
        } — anything included there would be charged again.`
      : null;

  const base = {
    lines,
    subtotal,
    mode,
    modeReason,
    visitOnlyItems,
    turnaroundHrs,
    overlapWarning,
    currency: 'INR',
  };

  // Without a centre there is no multiplier, so there is no total. Returning
  // the subtotal as if it were the price would be inventing a number: the same
  // test genuinely costs different amounts at different labs.
  if (!labCenterId) {
    return {
      ...base,
      lab: null,
      labAdjustment: null,
      total: null,
      totalPending: true,
      totalPendingReason: 'Choose a lab centre to see the final price.',
    };
  }

  const lab = await labRepository.findLabById(labCenterId);

  if (!lab || !lab.isVerified) {
    throw new AppError(
      'That lab centre is not available for bookings',
      404,
      'LAB_NOT_AVAILABLE'
    );
  }

  const multiplier = lab.priceMultiplier ?? 1.0;

  // THE function the booking charges with, called the way createBooking calls
  // it. Packages are TestCatalog documents like any other item here, so they
  // go through `tests` and `packageItem` stays null — the sum is identical
  // either way, and routing every line the same way keeps this honest.
  const total = calculateBookingPrice({ tests: catalogueItems, packageItem: null, multiplier });

  return {
    ...base,
    lab: {
      id: lab._id?.toString() ?? lab.id,
      name: lab.name,
      area: lab.area,
      priceMultiplier: multiplier,
      accreditation: lab.accreditation ?? { nabl: false, iso: false },
    },
    // Derived from the total rather than computed alongside it, so the column
    // the patient reads always adds up: subtotal + adjustment === total, by
    // construction and not by coincidence.
    labAdjustment: total - subtotal,
    total,
    totalPending: false,
    totalPendingReason: null,
    ...(typeof lat === 'number' && typeof lng === 'number' ? { lat, lng } : {}),
  };
}

export default { quoteCart, resolveCartMode };
