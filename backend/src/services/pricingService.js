/**
 * Calculates final booking price given tests/packages and the selected lab multiplier.
 * Formula: Math.round(basePrice * multiplier)
 * Ensures zero floating point issues and whole INR figures.
 *
 * @param {Object} params
 * @param {Array<{ basePrice: number }>} [params.tests] - Array of test items with basePrice
 * @param {Array<{ basePrice: number }>} [params.packageItems] - Packages with basePrice
 * @param {Object} [params.packageItem] - Single package; folded into packageItems
 * @param {number} [params.multiplier=1.0] - Lab price multiplier
 * @returns {number} Final price in INR (integer)
 */
export function calculateBookingPrice({
  tests = [],
  packageItems = [],
  packageItem = null,
  multiplier = 1.0,
}) {
  const labMultiplier = typeof multiplier === 'number' && multiplier > 0 ? multiplier : 1.0;

  let totalBase = 0;

  // Singular and plural both accepted, and both counted. Callers were updated
  // together with this change, but a caller passing the old shape must keep
  // getting the right number rather than silently dropping the package.
  const allPackages = [...(Array.isArray(packageItems) ? packageItems : []), ...(packageItem ? [packageItem] : [])];

  for (const item of allPackages) {
    if (item && typeof item.basePrice === 'number') {
      totalBase += item.basePrice;
    }
  }

  if (Array.isArray(tests)) {
    for (const test of tests) {
      if (test && typeof test.basePrice === 'number') {
        totalBase += test.basePrice;
      }
    }
  }

  return Math.round(totalBase * labMultiplier);
}

export default {
  calculateBookingPrice,
};
