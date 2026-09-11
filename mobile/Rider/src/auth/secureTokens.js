import * as SecureStore from 'expo-secure-store';

/**
 * Token storage.
 *
 * CONTEXT §7.3: "`expo-secure-store` only. Never AsyncStorage for credentials."
 * AsyncStorage is an unencrypted file in the app sandbox, readable on a rooted
 * device and by anything that can read a backup; SecureStore is the Android
 * Keystore / iOS Keychain. The offline queue does use AsyncStorage, but it
 * holds no credentials — see src/offline/queue.js.
 */

const ACCESS_TOKEN_KEY = 'pathcare.rider.accessToken';
const REFRESH_TOKEN_KEY = 'pathcare.rider.refreshToken';

/**
 * An in-memory mirror of the access token.
 *
 * Every outgoing request asks for it, and a SecureStore read crosses the native
 * bridge. Reading from the keystore on each of the six-odd calls a screen makes
 * is measurable jank on a mid-range Android device, so the token is cached here
 * and the keystore stays the durable copy.
 */
let cachedAccessToken = null;

export async function getAccessToken() {
  if (cachedAccessToken) return cachedAccessToken;
  cachedAccessToken = await SecureStore.getItemAsync(ACCESS_TOKEN_KEY);
  return cachedAccessToken;
}

export async function getRefreshToken() {
  return SecureStore.getItemAsync(REFRESH_TOKEN_KEY);
}

export async function saveTokens({ accessToken, refreshToken }) {
  cachedAccessToken = accessToken ?? null;

  if (accessToken) {
    await SecureStore.setItemAsync(ACCESS_TOKEN_KEY, accessToken);
  }
  // A rotation that returns no new refresh token must not silently wipe the one
  // we hold, or the next cold start is a forced logout.
  if (refreshToken) {
    await SecureStore.setItemAsync(REFRESH_TOKEN_KEY, refreshToken);
  }
}

export async function clearTokens() {
  cachedAccessToken = null;
  await Promise.all([
    SecureStore.deleteItemAsync(ACCESS_TOKEN_KEY),
    SecureStore.deleteItemAsync(REFRESH_TOKEN_KEY),
  ]);
}

export async function hasStoredSession() {
  return Boolean(await SecureStore.getItemAsync(REFRESH_TOKEN_KEY));
}
