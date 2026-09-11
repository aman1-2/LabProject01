import { configureApi, refreshSession } from '@pathcare/api';
import { API_BASE_URL, CLIENT_HEADERS } from '../config/env.js';
import { getAccessToken, getRefreshToken, saveTokens, clearTokens } from '../auth/secureTokens.js';

/**
 * Binds the shared transport to this app's storage and session rules.
 *
 * Every network call in the app goes through @pathcare/api. There is no second
 * fetch path: token injection, 401 refresh and error normalisation are defined
 * once, in the shared package, and configured once, here.
 */
export function configurePatientApi({ onSessionExpired } = {}) {
  configureApi({
    baseUrl: API_BASE_URL,
    headers: CLIENT_HEADERS,
    getAccessToken,

    /**
     * Called by the shared client on a 401, at most once per failure and
     * de-duplicated across concurrent requests. Returns the new access token,
     * or null to end the session.
     */
    refreshAccessToken: async () => {
      const refreshToken = await getRefreshToken();
      if (!refreshToken) return null;

      try {
        const result = await refreshSession({ refreshToken });
        if (!result?.token) return null;

        // The server rotates the refresh token on every use; storing the new
        // one is not optional, or the next refresh is rejected as a replay.
        await saveTokens({ accessToken: result.token, refreshToken: result.refreshToken });
        return result.token;
      } catch {
        return null;
      }
    },

    onSessionExpired: async () => {
      await clearTokens();
      if (typeof onSessionExpired === 'function') {
        onSessionExpired();
      }
    },
  });
}
