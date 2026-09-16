import authService from '../services/authService.js';

// The refresh token is delivered as an httpOnly cookie. It was previously ALSO
// returned in the JSON body unconditionally, which hands it to any script
// running on the page and defeats the point of httpOnly.
//
// Native clients are a genuine exception: an Expo app has no cookie jar we
// control, and requires tokens to live in `expo-secure-store` (the
// OS keystore), so the token has to arrive in the body or the mobile apps
// cannot hold a session at all. There is no DOM and no third-party script in a
// native app, so the XSS threat the httpOnly cookie defends against is absent.
//
// The gate cannot be a plain header: XSS on the web origin could add
// `X-Client-Type: mobile` to its own same-origin fetch, let the browser attach
// the httpOnly cookie automatically, and read the token straight out of the
// JSON — exactly the attack the body echo was removed to prevent. So we also
// require the ABSENCE of headers the browser sets itself and page script can
// neither forge nor suppress. A real device sends none of them; a browser sends
// at least one on every request.
const REFRESH_TOKEN_MAX_AGE_MS = 30 * 24 * 60 * 60 * 1000; // 30 days

/**
 * Cookie attributes for the refresh token, decided per request.
 *
 * These were fixed at `sameSite: 'lax'` with `secure` keyed off NODE_ENV. That
 * works only while the site and the API share an origin. The moment the web
 * app is on one domain and the API on another — a Vercel frontend calling an
 * ALB, which is the deployed shape — the browser treats every API call as
 * cross-site and a Lax cookie is simply never sent. The refresh token stops
 * arriving, so the session dies on the first page reload. Worse after a payment
 * redirect: the patient pays and lands back signed out.
 *
 * `SameSite=None` is what permits a cross-site cookie, and browsers reject it
 * unless `Secure` is also set — so the two must be decided together, from
 * whether THIS request arrived over HTTPS rather than from a build-time guess.
 * `req.secure` reads X-Forwarded-Proto behind the ALB because `trust proxy` is
 * configured (app.js), so it is accurate in production and correctly false on
 * a plain-HTTP local dev server, where Lax is both adequate and required.
 */
function cookieOptions(req) {
  const overHttps = Boolean(req.secure);
  return {
    httpOnly: true,
    secure: overHttps,
    // None needs Secure; on plain HTTP the browser would drop the cookie
    // entirely, so fall back to Lax, which is fine for same-origin dev.
    sameSite: overHttps ? 'none' : 'lax',
    maxAge: REFRESH_TOKEN_MAX_AGE_MS,
    path: '/',
  };
}

/** Headers a browser sets itself; page script can neither forge nor remove them. */
const BROWSER_ONLY_HEADERS = ['origin', 'referer', 'sec-fetch-mode', 'sec-fetch-site', 'sec-fetch-dest'];

/**
 * True only for a non-browser client that has explicitly asked for body
 * delivery of the refresh token. Fail-closed: anything ambiguous is treated as
 * a browser and gets the cookie only.
 */
export function isNativeClient(req) {
  if (String(req.get('x-client-type') || '').toLowerCase() !== 'mobile') {
    return false;
  }
  return !BROWSER_ONLY_HEADERS.some((header) => Boolean(req.get(header)));
}

/** Adds the refresh token to a response body for native clients, and only them. */
function withRefreshToken(req, body, refreshToken) {
  return isNativeClient(req) ? { ...body, refreshToken } : body;
}

export async function handleAvailable(req, res, next) {
  try {
    const handle = req.body.handle || req.query.handle;
    const result = await authService.checkHandleAvailable(handle);
    return res.status(200).json(result);
  } catch (error) {
    next(error);
  }
}

export async function signup(req, res, next) {
  try {
    const result = await authService.initiateSignup(req.body);
    return res.status(200).json(result);
  } catch (error) {
    next(error);
  }
}

export async function verifyOtp(req, res, next) {
  try {
    const { otpToken, otp } = req.body;
    const result = await authService.verifyOtpAndCreateUser(otpToken, otp);

    // Set refresh token in secure httpOnly cookie
    res.cookie('refreshToken', result.refreshToken, cookieOptions(req));

    return res.status(201).json(
      withRefreshToken(req, { success: true, token: result.token, user: result.user }, result.refreshToken)
    );
  } catch (error) {
    next(error);
  }
}

export async function login(req, res, next) {
  try {
    const { accountHandle, password } = req.body;
    const result = await authService.loginWithPassword(accountHandle, password);

    res.cookie('refreshToken', result.refreshToken, cookieOptions(req));

    return res.status(200).json(
      withRefreshToken(req, { success: true, token: result.token, user: result.user }, result.refreshToken)
    );
  } catch (error) {
    next(error);
  }
}

export async function loginOtp(req, res, next) {
  try {
    const { phone } = req.body;
    const result = await authService.initiateLoginOtp(phone);
    return res.status(200).json(result);
  } catch (error) {
    next(error);
  }
}

export async function verifyLoginOtp(req, res, next) {
  try {
    const { otpToken, otp } = req.body;
    const result = await authService.verifyLoginOtp(otpToken, otp);

    res.cookie('refreshToken', result.refreshToken, cookieOptions(req));

    return res.status(200).json(
      withRefreshToken(req, { success: true, token: result.token, user: result.user }, result.refreshToken)
    );
  } catch (error) {
    next(error);
  }
}

export async function refresh(req, res, next) {
  try {
    const rawRefreshToken = req.cookies?.refreshToken || req.body?.refreshToken;
    const result = await authService.rotateRefreshToken(rawRefreshToken);

    res.cookie('refreshToken', result.refreshToken, cookieOptions(req));

    return res.status(200).json(
      withRefreshToken(req, { success: true, token: result.token, user: result.user }, result.refreshToken)
    );
  } catch (error) {
    next(error);
  }
}

export async function logout(req, res, next) {
  try {
    const authHeader = req.headers.authorization;
    const accessToken = authHeader && authHeader.startsWith('Bearer ') ? authHeader.split(' ')[1] : null;
    const rawRefreshToken = req.cookies?.refreshToken || req.body?.refreshToken;

    await authService.logout(accessToken, rawRefreshToken);

    res.clearCookie('refreshToken', { ...cookieOptions(req), maxAge: 0 });

    return res.status(200).json({ success: true, message: 'Logged out successfully' });
  } catch (error) {
    next(error);
  }
}


/**
 * POST /api/auth/change-password
 *
 * Reachable while `mustChangePassword` is set — it is the one thing such an
 * account is allowed to do, and the way out of that state.
 */
export async function changePassword(req, res, next) {
  try {
    const result = await authService.changePassword({
      userId: req.user.userId,
      currentPassword: req.body.currentPassword,
      newPassword: req.body.newPassword,
    });

    res.status(200).json({ success: true, data: result });
  } catch (error) {
    next(error);
  }
}

export default {
  changePassword,
  handleAvailable,
  signup,
  verifyOtp,
  login,
  loginOtp,
  verifyLoginOtp,
  refresh,
  logout,
};
