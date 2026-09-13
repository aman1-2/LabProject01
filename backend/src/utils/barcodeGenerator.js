import crypto from 'crypto';

/**
 * Generate a deterministic, unique, collision-safe barcode for a physical sample.
 *
 * Format: PC-<YYMMDD>-<BOOKING_SUFFIX>-<SALT_OR_CHECKSUM>
 * Example: PC-260904-89ABCD-01A2
 *
 * @param {string|import('mongoose').Types.ObjectId} bookingId
 * @param {Object} [options]
 * @param {Date} [options.date] - Collection date (defaults to now)
 * @param {number} [options.attempt=0] - Collision retry index (0 for first try, incremented on collision)
 * @returns {string} Standardized uppercase barcode string
 */
export function generateDeterministicBarcode(bookingId, { date = new Date(), attempt = 0 } = {}) {
  if (!bookingId) {
    throw new Error('bookingId is required to generate sample barcode');
  }

  const bIdStr = bookingId.toString().replace(/[^a-fA-F0-9]/g, '');
  const suffix = (bIdStr.slice(-6) || '000000').toUpperCase();

  // Format date as YYMMDD
  const yy = String(date.getFullYear()).slice(-2);
  const mm = String(date.getMonth() + 1).padStart(2, '0');
  const dd = String(date.getDate()).padStart(2, '0');
  const dateStr = `${yy}${mm}${dd}`;

  // Deterministic 4-char checksum derived from bookingId, dateStr, and attempt
  const hashInput = `${bIdStr}:${dateStr}:${attempt}`;
  const checksum = crypto
    .createHash('sha256')
    .update(hashInput)
    .digest('hex')
    .slice(0, 4)
    .toUpperCase();

  return `PC-${dateStr}-${suffix}-${checksum}`;
}

/**
 * Validate barcode format
 * @param {string} barcode
 * @returns {boolean}
 */
export function isValidBarcodeFormat(barcode) {
  if (!barcode || typeof barcode !== 'string') return false;
  return /^PC-\d{6}-[A-F0-9]{6}-[A-F0-9]{4}$/.test(barcode.trim().toUpperCase());
}

export default {
  generateDeterministicBarcode,
  isValidBarcodeFormat,
};
