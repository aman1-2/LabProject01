import axios from 'axios';
import { getApiConfig } from './config.js';

/**
 * The single HTTP transport for every PathCare client.
 *
 * Its request interceptor used to be a literal no-op with a comment reading
 * "Authorization token injection placeholder", which meant nothing calling this
 * client ever sent an Authorization header. Token injection and 401 refresh now
 * live here so that "all API calls go through common/api" is true rather than
 * nominal, and so no app reimplements session handling.
 */
export const createApiClient = (baseURL) => {
  const instance = axios.create({
    // Resolved per-request below, so configureApi() can run after this module
    // is imported (it always does — apps configure inside their entrypoint).
    baseURL: baseURL || undefined,
    timeout: 15000,
    headers: { 'Content-Type': 'application/json' },
    /**
     * Send and accept cookies on cross-origin requests.
     *
     * The refresh token is an httpOnly cookie the server sets on sign-in. The
     * website runs on a different port from the API, which makes every call
     * cross-origin, and axios neither stores nor returns cookies on such calls
     * unless this is set. Without it the cookie was dropped on arrival, so
     * `/auth/refresh` had nothing to present and every full page reload signed
     * the user out — silently, because a 401 there is indistinguishable from a
     * session that genuinely expired.
     *
     * Safe because the server pairs `credentials: true` with an explicit
     * origin allowlist rather than `*` (see backend/src/app.js); a wildcard
     * origin with credentials is rejected by browsers precisely to stop this
     * being used to attach someone's cookies to an arbitrary site.
     *
     * Harmless on React Native, which has no cookie jar of this kind — the
     * apps identify with `X-Client-Type: mobile` and receive the refresh token
     * in the response body instead.
     */
    withCredentials: true,
  });

  /**
   * A single in-flight refresh shared by every request that 401s at once. On a
   * cold app start half a dozen queries fire together; without this they would
   * each rotate the refresh token, and all but one would be rejected as a
   * replay of a token that had already been rotated away.
   */
  let refreshInFlight = null;

  instance.interceptors.request.use(
    async (config) => {
      const { baseUrl, getAccessToken, headers } = getApiConfig();

      if (!baseURL && !config.baseURL) {
        config.baseURL = baseUrl;
      }

      for (const [key, value] of Object.entries(headers || {})) {
        if (config.headers[key] === undefined) {
          config.headers[key] = value;
        }
      }

      if (config._refreshedToken) {
        // A replay after refresh. The token is carried on the config rather than
        // re-read from the provider: a retry must use the token the refresh just
        // produced, not whatever the provider happens to return, which may not
        // have been flushed to secure storage yet. Re-reading here sent the
        // stale token straight back and produced an endless 401.
        config.headers.Authorization = `Bearer ${config._refreshedToken}`;
      } else if (!config.skipAuth && typeof getAccessToken === 'function') {
        // `skipAuth` is for the login and refresh calls themselves.
        const token = await getAccessToken();
        if (token) {
          config.headers.Authorization = `Bearer ${token}`;
        }
      }

      return config;
    },
    (error) => Promise.reject(error)
  );

  instance.interceptors.response.use(
    (response) => response,
    async (error) => {
      const original = error.config;
      const status = error.response?.status;
      const { refreshAccessToken, onSessionExpired } = getApiConfig();

      const canRetry =
        status === 401 &&
        original &&
        !original._retriedAfterRefresh &&
        !original.skipAuth &&
        typeof refreshAccessToken === 'function';

      if (canRetry) {
        original._retriedAfterRefresh = true;

        if (!refreshInFlight) {
          refreshInFlight = Promise.resolve()
            .then(() => refreshAccessToken())
            .catch(() => null)
            .finally(() => {
              // Cleared on the next tick so callers that resolved in this turn
              // all observe the same promise.
              setTimeout(() => {
                refreshInFlight = null;
              }, 0);
            });
        }

        const newToken = await refreshInFlight;

        if (newToken) {
          original._refreshedToken = newToken;
          return instance(original);
        }

        if (typeof onSessionExpired === 'function') {
          await onSessionExpired();
        }
      }

      // Normalise to the server's { error: { message, code, details } } envelope
      // so every caller handles one error shape.
      return Promise.reject({
        message: error.response?.data?.error?.message || error.message || 'Request failed',
        code: error.response?.data?.error?.code || (status ? 'UNKNOWN_ERROR' : 'NETWORK_ERROR'),
        status,
        details: error.response?.data?.error?.details,
        /** True when the request never reached the server — drives offline queueing. */
        isNetworkError: !error.response,
        raw: error,
      });
    }
  );

  return instance;
};

export const apiClient = createApiClient();

// ---------------------------------------------------------------------------
// Catalogue and lab methods
// ---------------------------------------------------------------------------

export async function fetchTests(params = {}) {
  const response = await apiClient.get('/api/tests', { params });
  return response.data?.data;
}

export async function fetchTestBySlug(slug) {
  const response = await apiClient.get(`/api/tests/${slug}`);
  return response.data?.data;
}

export async function fetchNearbyLabs({ lat, lng, testId, maxDistanceKm = 50 }) {
  const response = await apiClient.get('/api/labs/nearby', {
    params: { lat, lng, testId, maxDistanceKm },
  });
  return response.data?.data;
}

/**
 * Prices a basket server-side.
 *
 * The client sends only WHAT is in the cart — slugs or ids — and the lab to
 * price at. It sends no prices and no total: the server computes every figure
 * from the live catalogue with the same function the booking charges with, so
 * a quote cannot disagree with the debit (CONTEXT §3.2, §7.3).
 */
export async function fetchCartQuote(
  { items, labCenterId = null, lat, lng } = {},
  client = apiClient
) {
  const response = await client.post('/api/cart/quote', {
    items,
    ...(labCenterId ? { labCenterId } : {}),
    ...(typeof lat === 'number' ? { lat } : {}),
    ...(typeof lng === 'number' ? { lng } : {}),
  });
  return response.data?.data;
}

export async function fetchDoctors(params = {}, client = apiClient) {
  const response = await client.get('/api/doctors', { params });
  return response.data?.data;
}

export async function createBooking(payload, idempotencyKey, client = apiClient) {
  const response = await client.post('/api/bookings', payload, {
    headers: { 'Idempotency-Key': idempotencyKey },
  });
  return response.data;
}

export async function fetchBookings(params = {}, client = apiClient) {
  const response = await client.get('/api/bookings', { params });
  return response.data?.data;
}

export async function fetchBookingById(id, client = apiClient) {
  const response = await client.get(`/api/bookings/${id}`);
  return response.data?.data;
}

export default apiClient;
