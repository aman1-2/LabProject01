import Constants from 'expo-constants';

/**
 * Where this deployment operates.
 *
 * Every value comes from `app.config.js` extra, which reads the environment.
 * Nothing is hardcoded here on purpose.
 *
 * The history is the argument: the launch city was written into a `DEHRADUN`
 * constant, a form label, an empty-state message and three sets of
 * coordinates. Moving to Moradabad meant finding all of them, and the ones
 * missed did not fail loudly — they kept serving a real, wrong city. Worse,
 * a patient's address TEXT said Moradabad while their saved coordinates said
 * Dehradun, so the lab search ran 200km away and returned nothing.
 *
 * `app.config.js` refuses an EAS build when any of these is missing, so a
 * release cannot ship a blank city or NaN coordinates.
 */
const extra = Constants.expoConfig?.extra ?? Constants.manifest?.extra ?? {};

const read = (value, name) => {
  const v = (value ?? '').toString().trim();
  if (!v && __DEV__) {
    // Loud in development; impossible in a release (the config guard blocks it).
    console.error(`[locale] EXPO_PUBLIC_${name} is not set — see .env.example.`);
  }
  return v;
};

/** The city this deployment serves, e.g. "Moradabad". */
export const CITY = read(extra.city, 'CITY');

/** Its state, for addresses and footers. */
export const STATE = read(extra.state, 'STATE');

/** "Moradabad, Uttar Pradesh". */
export const CITY_STATE = [CITY, STATE].filter(Boolean).join(', ');

/**
 * A representative locality for placeholders and example addresses.
 *
 * A real, central area rather than a lorem-ipsum one: it is shown as an
 * example of what a patient should type, and a nonsense example teaches
 * nothing.
 */
export const SAMPLE_AREA = read(extra.sampleArea, 'SAMPLE_AREA');

/** "Civil Lines, Moradabad". */
export const SAMPLE_ADDRESS = [SAMPLE_AREA, CITY].filter(Boolean).join(', ');

/**
 * City-centre coordinates, used only as the origin for "labs near you" before
 * the patient has saved an address. Once they have one, theirs is used.
 *
 * A default, not a geocoder: typing a new address does not move these.
 */
export const DEFAULT_LAT = Number(read(extra.defaultLat, 'DEFAULT_LAT'));
export const DEFAULT_LNG = Number(read(extra.defaultLng, 'DEFAULT_LNG'));

/** The shape the old `DEHRADUN` constant had, so call sites read the same. */
export const CITY_CENTRE = {
  name: CITY,
  state: STATE,
  lat: DEFAULT_LAT,
  lng: DEFAULT_LNG,
};

export default { CITY, STATE, CITY_STATE, SAMPLE_AREA, SAMPLE_ADDRESS, DEFAULT_LAT, DEFAULT_LNG, CITY_CENTRE };
