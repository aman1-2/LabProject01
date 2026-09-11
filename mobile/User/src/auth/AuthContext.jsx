import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import {
  loginWithPassword,
  requestLoginOtp,
  verifyLoginOtp,
  startSignup,
  verifySignupOtp,
  refreshSession,
  logout as logoutRequest,
} from '@pathcare/api';
import { configurePatientApi } from '../api/configure.js';
import { saveTokens, clearTokens, getRefreshToken } from './secureTokens.js';

const AuthContext = createContext(null);

/** 'restoring' until the stored session has been checked — never assume signed out. */
/**
 * Dehradun. CONTEXT §2.5 — one city at launch, so there is no city selector;
 * the coordinates are the city centre and are refined by the patient's own
 * saved addresses once they add one.
 */
const DEFAULT_LOCATION = {
  lat: 30.3165,
  lng: 78.0322,
  address: 'Dehradun, Uttarakhand',
  source: 'default',
};

export const SESSION = {
  RESTORING: 'restoring',
  SIGNED_OUT: 'signed_out',
  SIGNED_IN: 'signed_in',
};

export function AuthProvider({ children }) {
  const [status, setStatus] = useState(SESSION.RESTORING);
  const [user, setUser] = useState(null);

  const endSession = useCallback(async () => {
    await clearTokens();
    setUser(null);
    setStatus(SESSION.SIGNED_OUT);
  }, []);

  // Configure the shared transport once, before anything can make a request.
  // Done in a layout-effect-free eager call so the first render's queries
  // already carry a token.
  useMemo(() => {
    configurePatientApi({
      onSessionExpired: () => {
        setUser(null);
        setStatus(SESSION.SIGNED_OUT);
      },
    });
  }, []);

  /**
   * Restore on cold start.
   *
   * The access token is short-lived and will usually be stale after the app has
   * been closed, so this rotates rather than trusting what is stored. If the
   * refresh token is gone or rejected, the rider signs in again — the app never
   * shows a Jobs list it cannot actually load.
   */
  useEffect(() => {
    let cancelled = false;

    (async () => {
      const refreshToken = await getRefreshToken();
      if (!refreshToken) {
        if (!cancelled) setStatus(SESSION.SIGNED_OUT);
        return;
      }

      try {
        const result = await refreshSession({ refreshToken });
        if (cancelled) return;

        if (result?.token) {
          await saveTokens({ accessToken: result.token, refreshToken: result.refreshToken });
          setUser(result.user ?? null);
          setStatus(SESSION.SIGNED_IN);
        } else {
          await endSession();
        }
      } catch {
        if (!cancelled) await endSession();
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [endSession]);

  const applySession = useCallback(async (result) => {
    if (!result?.token) {
      throw { code: 'NO_TOKEN_RETURNED', message: 'Sign-in did not return a session' };
    }
    if (!result.refreshToken) {
      // Without this the app is signed in only until the access token expires.
      // Failing loudly beats a session that mysteriously dies in twenty minutes.
      throw {
        code: 'NO_REFRESH_TOKEN',
        message: 'The server did not return a refresh token for this device. Check the API version.',
      };
    }
    await saveTokens({ accessToken: result.token, refreshToken: result.refreshToken });
    setUser(result.user ?? null);
    setStatus(SESSION.SIGNED_IN);
    return result.user;
  }, []);

  const signInWithPassword = useCallback(
    async ({ accountHandle, password }) => applySession(await loginWithPassword({ accountHandle, password })),
    [applySession]
  );

  const startOtpSignIn = useCallback(async ({ phone }) => requestLoginOtp({ phone }), []);

  /**
   * Sign-up is two steps: this requests the OTP, `completeSignUp` verifies it
   * and creates the account. No session exists until the phone is verified.
   *
   * `location` is required by the API and is the patient's city coordinates,
   * used to find their nearest lab centres. Dehradun only at launch (§2.5).
   */
  const signUp = useCallback(
    async ({ accountHandle, phone, name, password, accountType, location }) =>
      startSignup({
        accountHandle,
        phone,
        name,
        password,
        accountType,
        location: location ?? DEFAULT_LOCATION,
      }),
    []
  );

  const completeSignUp = useCallback(
    async ({ otpToken, otp }) => applySession(await verifySignupOtp({ otpToken, otp })),
    [applySession]
  );

  const completeOtpSignIn = useCallback(
    async ({ otpToken, otp }) => applySession(await verifyLoginOtp({ otpToken, otp })),
    [applySession]
  );

  const signOut = useCallback(async () => {
    const refreshToken = await getRefreshToken();
    try {
      // Revoke server-side so the refresh token cannot be reused if the device
      // is later compromised. A failure here must still sign the rider out
      // locally, so the local clear is unconditional.
      await logoutRequest({ refreshToken });
    } catch {
      /* network failure must not trap the rider in a session */
    }
    await endSession();
  }, [endSession]);

  const value = useMemo(
    () => ({
      status,
      user,
      isSignedIn: status === SESSION.SIGNED_IN,
      signInWithPassword,
      startOtpSignIn,
      completeOtpSignIn,
      signUp,
      completeSignUp,
      signOut,
      setUser,
    }),
    [status, user, signInWithPassword, startOtpSignIn, completeOtpSignIn, signUp, completeSignUp, signOut]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) throw new Error('useAuth must be used inside an AuthProvider');
  return context;
}
