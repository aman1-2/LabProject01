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
const COOKIE_OPTIONS = {
  httpOnly: true,
  secure: process.env.NODE_ENV === 'production',
  sameSite: 'lax',
  maxAge: 30 * 24 * 60 * 60 * 1000, // 30 days
  path: '/',
};

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
    res.cookie('refreshToken', result.refreshToken, COOKIE_OPTIONS);

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

    res.cookie('refreshToken', result.refreshToken, COOKIE_OPTIONS);

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

    res.cookie('refreshToken', result.refreshToken, COOKIE_OPTIONS);

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

    res.cookie('refreshToken', result.refreshToken, COOKIE_OPTIONS);

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

    res.clearCookie('refreshToken', { ...COOKIE_OPTIONS, maxAge: 0 });

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
