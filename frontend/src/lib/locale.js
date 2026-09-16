/**
 * Where this deployment operates.
 *
 * Every value here comes from the environment. Nothing is hardcoded, and there
 * are no city fallbacks in this file on purpose.
 *
 * The history is the argument: the launch city was written into ~20 strings and
 * a set of coordinates across 16 files. Moving from Dehradun to Moradabad meant
 * finding all of them, and the ones that were missed did not fail loudly — they
 * kept serving a real, wrong city. A patient's address text said Moradabad
 * while their coordinates said Dehradun, so the lab search ran 200km away and
 * the booking button did nothing.
 *
 * `vite.config.js` refuses to produce a production build when any of these is
 * missing, so a deploy fails at build time rather than shipping a blank city
 * name or an undefined coordinate to a patient.
 */

const read = (value, name) => {
  const v = (value ?? '').toString().trim();
  if (!v && import.meta.env.DEV) {
    // Loud in development, impossible in production (the build guard blocks it).
    console.error(
      `[locale] ${name} is not set. Add it to frontend/.env.local — see .env.example.`
    );
  }
  return v;
};

/** The city this deployment serves, e.g. "Moradabad". */
export const CITY = read(import.meta.env.VITE_CITY, 'VITE_CITY');

/** Its state, for footers and postal-style lines. */
export const STATE = read(import.meta.env.VITE_STATE, 'VITE_STATE');

/** "Moradabad, Uttar Pradesh" — the long form. */
export const CITY_STATE = [CITY, STATE].filter(Boolean).join(', ');

/**
 * A representative area for placeholders and example addresses.
 *
 * Deliberately a real, central locality rather than a lorem-ipsum one: it is
 * shown as an example of what a patient should type, and a nonsense example
 * teaches nothing.
 */
export const SAMPLE_AREA = read(import.meta.env.VITE_SAMPLE_AREA, 'VITE_SAMPLE_AREA');

/** "Civil Lines, Moradabad" — for address placeholders and fallbacks. */
export const SAMPLE_ADDRESS = [SAMPLE_AREA, CITY].filter(Boolean).join(', ');

/**
 * Starting coordinates, used only until a real position is known — before the
 * browser grants location permission, and as the initial state of the signup
 * form.
 *
 * A default, not a geocoder: typing a new address does not move these. Until
 * addresses are geocoded on save, the text and the position can still drift
 * apart, which is the remaining gap in this area.
 */
export const DEFAULT_LAT = Number(read(import.meta.env.VITE_DEFAULT_LAT, 'VITE_DEFAULT_LAT'));
export const DEFAULT_LNG = Number(read(import.meta.env.VITE_DEFAULT_LNG, 'VITE_DEFAULT_LNG'));

export default {
  CITY,
  STATE,
  CITY_STATE,
  SAMPLE_AREA,
  SAMPLE_ADDRESS,
  DEFAULT_LAT,
  DEFAULT_LNG,
};
