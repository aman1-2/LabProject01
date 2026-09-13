const { colors } = require('@pathcare/design-tokens');

/**
 * Expo config for the phlebotomist app.
 *
 * Every value that differs between environments is read from the environment
 * rather than written here. `EXPO_PUBLIC_*` variables are inlined into the
 * bundle by Expo, so nothing secret may go in one — the API base URL and the
 * Google Maps Android key are both public-by-design client identifiers.
 *
 * There is no fallback for the Maps key on purpose: a fabricated key produces a
 * grey tile grid that looks like a rendering bug rather than a missing
 * credential (CONTEXT §11). The Map tab reports the missing key instead.
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
const IS_PRODUCTION_BUILD =
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
    name: 'PathCare Rider',
    slug: 'pathcare-rider',
    version: '0.1.0',
    orientation: 'portrait',
    // No `icon` here on purpose. The config previously pointed at
    // ./assets/icon.png, which does not exist — a native build fails on it,
    // and a JS-only export never touches it, so it went unnoticed. An app icon
    // is brand artwork; inventing one would be inventing visual design. Add the
    // real asset and restore `icon: './assets/icon.png'` when it exists.
    userInterfaceStyle: 'light',
    newArchEnabled: true,
    splash: {
      backgroundColor: colors.blue900,
    },
    ios: {
      supportsTablet: false,
      bundleIdentifier: 'in.pathcare.rider',
      infoPlist: {
        NSCameraUsageDescription:
          'PathCare Rider uses the camera to scan the barcode on a sample vial so the label can be verified against the collection record.',
        NSLocationWhenInUseUsageDescription:
          'Your location is shared with the patient while you are on an active collection so they can see you approaching.',
        NSLocationAlwaysAndWhenInUseUsageDescription:
          'Your location is shared with the patient while you are on an active collection, including when the app is in the background.',
        UIBackgroundModes: ['location', 'remote-notification'],
      },
    },
    android: {
      usesCleartextTraffic: ALLOW_CLEARTEXT,
      package: 'in.pathcare.rider',
      adaptiveIcon: {
        backgroundColor: colors.blue900,
      },
      permissions: [
        'CAMERA',
        'ACCESS_COARSE_LOCATION',
        'ACCESS_FINE_LOCATION',
        'ACCESS_BACKGROUND_LOCATION',
        'FOREGROUND_SERVICE',
        'FOREGROUND_SERVICE_LOCATION',
        'POST_NOTIFICATIONS',
      ],
      config: {
        googleMaps: {
          // Undefined when unset — react-native-maps then reports a missing key
          // rather than silently rendering an empty map.
          apiKey: process.env.EXPO_PUBLIC_GOOGLE_MAPS_ANDROID_KEY,
        },
      },
    },
    plugins: [
      [
        'expo-camera',
        {
          cameraPermission:
            'PathCare Rider uses the camera to scan sample barcodes at collection and handoff.',
        },
      ],
      [
        'expo-location',
        {
          locationAlwaysAndWhenInUsePermission:
            'Your location is shared with the patient while you are on an active collection.',
          isAndroidBackgroundLocationEnabled: true,
          isAndroidForegroundServiceEnabled: true,
        },
      ],
      'expo-secure-store',
      'expo-notifications',
    ],
    extra: {
      apiBaseUrl: API_URL,
      googleMapsAndroidKey: process.env.EXPO_PUBLIC_GOOGLE_MAPS_ANDROID_KEY || null,
      // Only present when there actually is an EAS project. An empty value
      // becomes `null`, which Expo serialises into the manifest as `{}`; the
      // CLI then passes that object to a path function and throws
      // ERR_INVALID_ARG_TYPE, leaving the app showing only "Something went
      // wrong". A project ID is for EAS builds, not for running locally.
      ...(process.env.EXPO_PUBLIC_EAS_PROJECT_ID
        ? { eas: { projectId: process.env.EXPO_PUBLIC_EAS_PROJECT_ID } }
        : {}),
    },
  },
};
