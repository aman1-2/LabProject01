/**
 * Open Location Code (Plus Codes) — encode, decode, and short-code recovery.
 *
 * WHY THIS IS NOT AN API CALL
 *
 * A Plus Code is not a name that has to be looked up; it is a base-20 encoding
 * of a latitude/longitude pair. Decoding one is arithmetic, and the result is
 * exact — there is no service that could give a "more accurate" answer.
 *
 * The one thing arithmetic cannot supply is the part a SHORT code leaves out.
 * "RQHF+HGQ" drops the four leading characters that identify the 1° cell, so it
 * is only meaningful next to a locality ("RQHF+HGQ Moradabad"). `recoverNearest`
 * takes a reference point, borrows those four characters from it, and returns
 * the full code. The reference only has to fall inside the correct 1° cell —
 * roughly 55 km — so a city centre is ample, and the recovered coordinate is
 * then exact rather than approximate.
 *
 * Implements the specification at https://github.com/google/open-location-code.
 */

const ALPHABET = '23456789CFGHJMPQRVWX';
const BASE = 20;
const SEPARATOR = '+';
const SEPARATOR_POSITION = 8;
const PADDING = '0';
const PAIR_CODE_LENGTH = 10;
const GRID_COLUMNS = 4;
const GRID_ROWS = 5;
const LAT_MAX = 90;
const LNG_MAX = 180;

function clipLatitude(lat) {
  return Math.min(90, Math.max(-90, lat));
}

function normalizeLongitude(lng) {
  let l = lng;
  while (l < -180) l += 360;
  while (l >= 180) l -= 360;
  return l;
}

/** Height in degrees of a code of this length — used to keep lat 90 in range. */
function latitudePrecision(codeLength) {
  if (codeLength <= 10) {
    return BASE ** Math.floor(codeLength / -2 + 2);
  }
  return BASE ** -3 / GRID_ROWS ** (codeLength - 10);
}

const MAX_DIGIT_COUNT = 15;
const GRID_DIGITS = MAX_DIGIT_COUNT - PAIR_CODE_LENGTH; // 5
// Integer scale factors: 20^3 pair steps, then the 5x4 grid five times over.
const PAIR_PRECISION = BASE ** 3; // 8000
const FINAL_LAT_PRECISION = PAIR_PRECISION * GRID_ROWS ** GRID_DIGITS; // 25,000,000
const FINAL_LNG_PRECISION = PAIR_PRECISION * GRID_COLUMNS ** GRID_DIGITS; // 8,192,000

/**
 * Encoded with INTEGER arithmetic, deliberately.
 *
 * The float form of this reads more naturally — divide by the resolution, take
 * the floor, subtract, repeat — and is wrong. 1/20 has no exact binary form, so
 * `Math.floor(0.3 / 0.05)` is 5 rather than 6 and the digit comes out one place
 * off. Published test vectors hide it, because they use values that happen to
 * be exactly representable; real coordinates do not.
 */
export function encode(latitude, longitude, codeLength = PAIR_CODE_LENGTH) {
  let lat = clipLatitude(latitude);
  const lng = normalizeLongitude(longitude);

  // A point exactly on the north pole belongs to the cell below it.
  if (lat === 90) lat -= latitudePrecision(codeLength);

  let latVal = Math.round((lat + LAT_MAX) * FINAL_LAT_PRECISION);
  let lngVal = Math.round((lng + LNG_MAX) * FINAL_LNG_PRECISION);

  let code = '';

  // Digits 11-15 come off the low end first, so the divisions stay integral.
  if (codeLength > PAIR_CODE_LENGTH) {
    for (let i = 0; i < GRID_DIGITS; i += 1) {
      code = ALPHABET[(latVal % GRID_ROWS) * GRID_COLUMNS + (lngVal % GRID_COLUMNS)] + code;
      latVal = Math.floor(latVal / GRID_ROWS);
      lngVal = Math.floor(lngVal / GRID_COLUMNS);
    }
  } else {
    latVal = Math.floor(latVal / GRID_ROWS ** GRID_DIGITS);
    lngVal = Math.floor(lngVal / GRID_COLUMNS ** GRID_DIGITS);
  }

  // Digits 1-10, most significant last out of the loop.
  for (let i = 0; i < PAIR_CODE_LENGTH / 2; i += 1) {
    code = ALPHABET[latVal % BASE] + ALPHABET[lngVal % BASE] + code;
    latVal = Math.floor(latVal / BASE);
    lngVal = Math.floor(lngVal / BASE);
  }

  const trimmed = code.slice(0, Math.max(codeLength, SEPARATOR_POSITION));
  return `${trimmed.slice(0, SEPARATOR_POSITION)}${SEPARATOR}${trimmed.slice(SEPARATOR_POSITION)}`;
}

/**
 * @returns {{latLo, lngLo, latHi, lngHi, latCenter, lngCenter, codeLength}}
 */
export function decode(code) {
  const digits = code.replace(SEPARATOR, '').replace(new RegExp(`${PADDING}+$`), '').toUpperCase();

  let lat = -LAT_MAX;
  let lng = -LNG_MAX;
  let latRes = BASE * BASE;
  let lngRes = BASE * BASE;

  const pairs = Math.min(digits.length, PAIR_CODE_LENGTH);
  for (let i = 0; i < pairs; i += 2) {
    latRes /= BASE;
    lngRes /= BASE;
    lat += ALPHABET.indexOf(digits[i]) * latRes;
    lng += ALPHABET.indexOf(digits[i + 1]) * lngRes;
  }

  for (let i = PAIR_CODE_LENGTH; i < digits.length; i += 1) {
    latRes /= GRID_ROWS;
    lngRes /= GRID_COLUMNS;
    const d = ALPHABET.indexOf(digits[i]);
    lat += Math.floor(d / GRID_COLUMNS) * latRes;
    lng += (d % GRID_COLUMNS) * lngRes;
  }

  return {
    latLo: lat,
    lngLo: lng,
    latHi: lat + latRes,
    lngHi: lng + lngRes,
    latCenter: lat + latRes / 2,
    lngCenter: lng + lngRes / 2,
    codeLength: digits.length,
  };
}

/**
 * Expand a short code such as "RQHF+HGQ" using a nearby reference point.
 *
 * The reference supplies only the characters the short form omits, so it does
 * not need to be precise — it needs to be in the right cell.
 */
export function recoverNearest(shortCode, referenceLatitude, referenceLongitude) {
  const sep = shortCode.indexOf(SEPARATOR);
  if (sep < 0) throw new Error(`Not a Plus Code: ${shortCode}`);

  const paddingLength = SEPARATOR_POSITION - sep;
  if (paddingLength <= 0) return shortCode.toUpperCase(); // already a full code

  const resolution = BASE ** (2 - paddingLength / 2);
  const halfRes = resolution / 2;

  const refCode = encode(clipLatitude(referenceLatitude), normalizeLongitude(referenceLongitude));
  const full = refCode.replace(SEPARATOR, '').slice(0, paddingLength) + shortCode.toUpperCase();

  const area = decode(full);
  let { latCenter, lngCenter } = area;

  // The borrowed prefix can land one cell away from the reference; step back
  // toward it so the result is the NEAREST match, which is what the short form
  // means.
  const refLat = clipLatitude(referenceLatitude);
  const refLng = normalizeLongitude(referenceLongitude);

  if (refLat + halfRes < latCenter && latCenter - resolution >= -LAT_MAX) {
    latCenter -= resolution;
  } else if (refLat - halfRes > latCenter && latCenter + resolution <= LAT_MAX) {
    latCenter += resolution;
  }

  if (refLng + halfRes < lngCenter) {
    lngCenter -= resolution;
  } else if (refLng - halfRes > lngCenter) {
    lngCenter += resolution;
  }

  return { code: full, lat: latCenter, lng: lngCenter };
}

export default { encode, decode, recoverNearest };
