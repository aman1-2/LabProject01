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
      // Development only: the app talks to the API over plain HTTP on the
      // local network while testing. Android blocks cleartext from API 28
      // onward, and the failure is silent — every request just fails. Set
      // this to false (or drop the line) before any production build.
      usesCleartextTraffic: true,
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
      apiBaseUrl: process.env.EXPO_PUBLIC_API_URL || 'http://localhost:5000',
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
