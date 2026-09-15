/**
 * Where this deployment operates.
 *
 * The launch city was written into ~20 strings across 11 pages — headings,
 * FAQ copy, form placeholders, a fallback address. Moving from Dehradun to
 * Moradabad meant editing every one of them, and missing one meant a page
 * quietly advertising the wrong city to a patient. `VITE_CITY` existed in
 * `.env.example` the whole time but nothing read it.
 *
 * These are build-time values: Vite inlines `import.meta.env` at build, so a
 * change needs a redeploy, not just an environment edit.
 */

/** The city this deployment serves, e.g. "Moradabad". */
export const CITY = (import.meta.env.VITE_CITY || 'Moradabad').trim();

/** Its state, for footers and postal-style lines. */
export const STATE = (import.meta.env.VITE_STATE || 'Uttar Pradesh').trim();

/** "Moradabad, Uttar Pradesh" — the long form. */
export const CITY_STATE = `${CITY}, ${STATE}`;

/**
 * A representative street for placeholders and the "detect my location"
 * stub.
 *
 * Deliberately a real, central address rather than a lorem-ipsum one: it is
 * shown as an example of what a patient should type, and a nonsense example
 * teaches nothing. Override per deployment.
 */
export const SAMPLE_AREA = (import.meta.env.VITE_SAMPLE_AREA || 'Civil Lines').trim();

/** "Civil Lines, Moradabad" — for address placeholders and fallbacks. */
export const SAMPLE_ADDRESS = `${SAMPLE_AREA}, ${CITY}`;

export default { CITY, STATE, CITY_STATE, SAMPLE_AREA, SAMPLE_ADDRESS };
