const { colors } = require('@pathcare/design-tokens');

/**
 * Expo config for the patient app.
 *
 * Every environment-specific value is read from the environment.
 * `EXPO_PUBLIC_*` variables are inlined into the bundle, so nothing secret may
 * go in one — the API base URL and the Google Maps Android key are both
 * public-by-design client identifiers, and the Maps key is restricted by
 * package name and SHA-1 in the Google Cloud console.
 */
/**
 * Environment resolution, checked at build time.
 *
 * Two silent production failures were possible here:
 *
 *  1. `apiBaseUrl` fell back to `http://localhost:5000`. A release build made
 *     without EXPO_PUBLIC_API_URL set would install on a real phone and try to
 *     reach the handset itself — every request failing, with nothing in the
 *     build output to say why.
 *  2. `usesCleartextTraffic: true` was hardcoded with a comment asking someone
 *     to remember to turn it off. A store build shipping that permits
 *     unencrypted traffic to a production API.
 *
 * Both are now derived rather than remembered: a production build must supply
 * an https URL or the build stops here, and cleartext is enabled only while
 * actually talking to a plain-http dev server.
 */
const API_URL = process.env.EXPO_PUBLIC_API_URL || 'http://localhost:5000';
/**
 * Any build that leaves this machine needs a real API URL.
 *
 * This used to check only for the `production` profile, which missed the
 * `preview` profile entirely — and preview is the one that produces the APK
 * handed to real testers on real phones. Such a build would bake in
 * http://localhost:5000 and be dead on arrival, with no error until someone
 * opened it. `EAS_BUILD` is set by every EAS build regardless of profile.
 */
const IS_PRODUCTION_BUILD =
  process.env.EAS_BUILD === 'true' ||
  process.env.EAS_BUILD_PROFILE === 'production' ||
  process.env.APP_ENV === 'production' ||
  process.env.NODE_ENV === 'production';

if (IS_PRODUCTION_BUILD) {
  if (!process.env.EXPO_PUBLIC_API_URL) {
    throw new Error(
      'EXPO_PUBLIC_API_URL is not set for a production build. Refusing to bake in ' +
        'http://localhost:5000 — the app would be dead on every real device.'
    );
  }
  /**
   * Locale has no hardcoded fallback in src/config/locale.js, so a missing
   * value would ship a blank city name or NaN coordinates. NaN reaches the
   * lab search as `lat=NaN`, which returns nothing and looks to a patient
   * like "no labs serve you" rather than a misconfigured build.
   */
  const missingLocale = [
    ['EXPO_PUBLIC_CITY', 'the city name shown throughout the app'],
    ['EXPO_PUBLIC_STATE', 'the state, used in addresses'],
    ['EXPO_PUBLIC_SAMPLE_AREA', 'the example locality in address placeholders'],
    ['EXPO_PUBLIC_DEFAULT_LAT', 'the origin for "labs near you"'],
    ['EXPO_PUBLIC_DEFAULT_LNG', 'the origin for "labs near you"'],
  ].filter(([key]) => !(process.env[key] || '').trim());

  if (missingLocale.length) {
    throw new Error(
      ['Refusing to build: locale is not configured.']
        .concat(missingLocale.map(([k, why]) => `  - ${k} is not set — ${why}`))
        .join('\n')
    );
  }

  for (const key of ['EXPO_PUBLIC_DEFAULT_LAT', 'EXPO_PUBLIC_DEFAULT_LNG']) {
    if (Number.isNaN(Number(process.env[key]))) {
      throw new Error(`Refusing to build: ${key} is not a number (got "${process.env[key]}").`);
    }
  }

  if (!API_URL.startsWith('https://')) {
    throw new Error(
      `EXPO_PUBLIC_API_URL must be https for a production build (got "${API_URL}"). ` +
        'Shipping cleartext to a production API exposes tokens and health data in transit.'
    );
  }
}

// Cleartext is a development affordance only; it follows the URL scheme.
const ALLOW_CLEARTEXT = !API_URL.startsWith('https://');

module.exports = {
  expo: {
    name: 'PathCare',
    slug: 'pathcare',
    version: '0.1.0',
    orientation: 'portrait',
    userInterfaceStyle: 'light',
    newArchEnabled: true,
    scheme: 'pathcare',
    splash: {
      backgroundColor: colors.bg,
    },
    ios: {
      supportsTablet: false,
      bundleIdentifier: 'in.pathcare.app',
      infoPlist: {
        NSLocationWhenInUseUsageDescription:
          'Your location is used to find partner lab centres near you and to show your phlebotomist approaching.',
        UIBackgroundModes: ['remote-notification'],
      },
    },
    android: {
      usesCleartextTraffic: ALLOW_CLEARTEXT,
      package: 'in.pathcare.app',
      adaptiveIcon: { backgroundColor: colors.blue900 },
      permissions: ['ACCESS_COARSE_LOCATION', 'ACCESS_FINE_LOCATION', 'POST_NOTIFICATIONS'],
      config: {
        googleMaps: {
          apiKey: process.env.EXPO_PUBLIC_GOOGLE_MAPS_ANDROID_KEY,
        },
      },
    },
    plugins: [
      [
        'expo-location',
        {
          locationWhenInUsePermission:
            'Your location is used to find partner lab centres near you.',
        },
      ],
      'expo-secure-store',
      'expo-notifications',
      'expo-sqlite',
    ],
    extra: {
      apiBaseUrl: API_URL,
      /**
       * Where this deployment operates.
       *
       * The launch city was hardcoded across both apps — a `DEHRADUN` constant,
       * a "Service Address (Dehradun)" label, coordinates in three files. When
       * the service moved to Moradabad none of that failed; it kept serving a
       * real, wrong city, and a patient's address text and their coordinates
       * disagreed by 200km. Passed through here so a deployment sets it once.
       */
      city: process.env.EXPO_PUBLIC_CITY || null,
      state: process.env.EXPO_PUBLIC_STATE || null,
      sampleArea: process.env.EXPO_PUBLIC_SAMPLE_AREA || null,
      defaultLat: process.env.EXPO_PUBLIC_DEFAULT_LAT || null,
      defaultLng: process.env.EXPO_PUBLIC_DEFAULT_LNG || null,
      googleMapsAndroidKey: process.env.EXPO_PUBLIC_GOOGLE_MAPS_ANDROID_KEY || null,
      /**
       * Only present when there actually is an EAS project.
       *
       * An empty EXPO_PUBLIC_EAS_PROJECT_ID made this `null`, which Expo
       * serialises into the manifest as `{}` — and the CLI then passes that
       * object to a path function, throwing
       * `ERR_INVALID_ARG_TYPE: The "path" argument must be of type string`.
       * The app fails to load with only "Something went wrong" on screen.
       *
       * A project ID is needed for EAS builds and updates, not for running
       * locally, so omitting the key is correct rather than a workaround.
       */
      ...(process.env.EXPO_PUBLIC_EAS_PROJECT_ID
        ? { eas: { projectId: process.env.EXPO_PUBLIC_EAS_PROJECT_ID } }
        : {}),
    },
  },
};
