import dotenv from 'dotenv';
dotenv.config();

export const serverConfig = {
  port: parseInt(process.env.PORT || '5000', 10),
  nodeEnv: process.env.NODE_ENV || 'development',
  apiPrefix: process.env.API_PREFIX || '/api/v1',
  /**
   * Allowed browser origins, as a LIST.
   *
   * This was passed to `cors()` as the raw environment string, so a
   * comma-separated value produced
   * `Access-Control-Allow-Origin: http://a.com,http://b.com` — a header no
   * browser accepts, since the spec allows exactly one origin or `*`. With one
   * origin configured it happened to work, which is why it survived; the moment
   * a second was added (staging alongside local, or a LAN address for device
   * testing) every cross-origin request failed with an opaque CORS error.
   *
   * Splitting here lets the cors middleware echo back whichever single origin
   * matched the request.
   */
  corsOrigin: (process.env.CORS_ORIGIN || 'http://localhost:5173')
    .split(',')
    .map((origin) => origin.trim())
    .filter(Boolean),
  isProduction: process.env.NODE_ENV === 'production',
  /**
   * Whether CORS_ORIGIN was actually configured, as opposed to falling back.
   *
   * The fallback above is `http://localhost:5173`. In production that is not a
   * security hole but a total outage: the browser blocks every call from the
   * real frontend and the app looks dead, with the cause visible only in the
   * user's console. Asserted at boot so it fails on deploy instead.
   */
  corsOriginConfigured: Boolean((process.env.CORS_ORIGIN || '').trim()),
  isTest: process.env.NODE_ENV === 'test',
  // Number of proxy hops to trust for X-Forwarded-For. 1 = a single ALB in
  // front of the app. Set to 0 to disable when running without a proxy.
  trustProxy: parseInt(process.env.TRUST_PROXY_HOPS ?? '1', 10),
};

export default serverConfig;
