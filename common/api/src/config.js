/**
 * Runtime configuration for the shared API client.
 *
 * This package is consumed by three runtimes — Vite (web), Metro/Hermes
 * (Expo), and Node (tests) — so it deliberately reads NO build-time globals of
 * its own. `import.meta.env` in particular is a Vite construct that is a parse
 * error under some Metro configurations, and `process.env` does not exist in a
 * browser. Each app passes its own values in via `configureApi()` at startup.
 */

const defaults = {
  baseUrl: 'http://localhost:5000',
  /** Async () => string|null. Returns the current access token, if any. */
  getAccessToken: null,
  /**
   * Async () => string|null. Performs a token refresh and returns the NEW
   * access token, or null if the session is gone. The client calls this at most
   * once per 401, and de-duplicates concurrent callers.
   */
  refreshAccessToken: null,
  /** Called when refresh fails and the session must be treated as ended. */
  onSessionExpired: null,
  /**
   * Extra headers sent on every request. The mobile apps set
   * `X-Client-Type: mobile` here, which is what makes the server deliver the
   * refresh token in the response body (see backend authController).
   */
  headers: {},
};

let current = { ...defaults };

export function configureApi(options = {}) {
  current = { ...current, ...options };
  return current;
}

export function getApiConfig() {
  return current;
}

/** Test helper: restore the untouched defaults. */
export function resetApiConfig() {
  current = { ...defaults };
  return current;
}
