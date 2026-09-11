/**
 * Detox configuration for the phlebotomist app.
 *
 * Detox drives a real build on a real device or emulator, so it needs a native
 * project: run `npx expo prebuild` first. It cannot run inside Expo Go.
 *
 * The barcode step drives the camera, which an emulator cannot do meaningfully.
 * See e2e/collection.e2e.js for how that is handled.
 */
module.exports = {
  testRunner: {
    args: {
      $0: 'jest',
      config: 'e2e/jest.config.js',
    },
    jest: {
      setupTimeout: 180000,
    },
  },
  apps: {
    'android.debug': {
      type: 'android.apk',
      binaryPath: 'android/app/build/outputs/apk/debug/app-debug.apk',
      build:
        'cd android && ./gradlew assembleDebug assembleAndroidTest -DtestBuildType=debug && cd ..',
      reversePorts: [8081],
    },
    'android.release': {
      type: 'android.apk',
      binaryPath: 'android/app/build/outputs/apk/release/app-release.apk',
      build: 'cd android && ./gradlew assembleRelease assembleAndroidTest -DtestBuildType=release && cd ..',
    },
  },
  devices: {
    emulator: {
      type: 'android.emulator',
      device: {
        avdName: process.env.DETOX_AVD_NAME || 'Pixel_7_API_34',
      },
    },
    attached: {
      type: 'android.attached',
      device: {
        // A physical device, which is the only place the camera scan is real.
        adbName: process.env.DETOX_DEVICE_ID || '.*',
      },
    },
  },
  configurations: {
    'android.emu.debug': { device: 'emulator', app: 'android.debug' },
    'android.emu.release': { device: 'emulator', app: 'android.release' },
    'android.device.debug': { device: 'attached', app: 'android.debug' },
  },
};
