import Constants from 'expo-constants';

/**
 * Client configuration, read from app.config.js `extra`.
 *
 * Nothing here has a fabricated default. A missing Maps key stays null so the
 * Map tab can say so plainly; inventing a placeholder would render a broken map
 * that looks like a bug in our code (CONTEXT §11).
 */
const extra = Constants.expoConfig?.extra ?? Constants.manifest?.extra ?? {};

export const API_BASE_URL = extra.apiBaseUrl || 'http://localhost:5000';

export const GOOGLE_MAPS_ANDROID_KEY = extra.googleMapsAndroidKey || null;

export const EAS_PROJECT_ID = extra.eas?.projectId || null;

/**
 * Sent on every request. This is what makes the server return the refresh token
 * in the response body instead of a cookie the app cannot reach — see the
 * native-client gate in backend/src/controllers/authController.js.
 */
export const CLIENT_HEADERS = { 'X-Client-Type': 'mobile' };

/**
 * Location ping cadence. The server throttles to one update per 10s and answers
 * 429; the client stays inside that window so the rejection is a backstop, not
 * the normal path. Config-driven per CONTEXT §3.4.
 */
export const LOCATION_INTERVAL_MS = Number(extra.locationIntervalMs) || 15000;
export const LOCATION_DISTANCE_FILTER_M = Number(extra.locationDistanceFilterM) || 50;
