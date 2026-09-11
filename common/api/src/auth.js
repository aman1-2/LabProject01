import { apiClient } from './client.js';

/**
 * Auth endpoints (P01).
 *
 * All of these carry `skipAuth` so the request interceptor does not attach an
 * expired access token, and — more importantly — so a 401 from them is never
 * fed back into the refresh-and-retry loop.
 */

export async function loginWithPassword({ accountHandle, password }, client = apiClient) {
  const response = await client.post(
    '/api/auth/login',
    { accountHandle, password },
    { skipAuth: true }
  );
  return response.data;
}

export async function requestLoginOtp({ phone }, client = apiClient) {
  const response = await client.post('/api/auth/login/otp', { phone }, { skipAuth: true });
  return response.data;
}

/**
 * Step one of sign-up: sends the OTP. No account exists yet and no session is
 * issued — `verifySignupOtp` creates both once the phone is proven.
 */
export async function startSignup(payload, client = apiClient) {
  const response = await client.post('/api/auth/signup', payload, { skipAuth: true });
  return response.data;
}

export async function verifySignupOtp({ otpToken, otp }, client = apiClient) {
  const response = await client.post(
    '/api/auth/verify-otp',
    { otpToken, otp },
    { skipAuth: true }
  );
  return response.data;
}

export async function verifyLoginOtp({ otpToken, otp }, client = apiClient) {
  const response = await client.post(
    '/api/auth/login/verify-otp',
    { otpToken, otp },
    { skipAuth: true }
  );
  return response.data;
}

export async function refreshSession({ refreshToken } = {}, client = apiClient) {
  const response = await client.post(
    '/api/auth/refresh',
    refreshToken ? { refreshToken } : {},
    { skipAuth: true }
  );
  return response.data;
}

export async function logout({ refreshToken } = {}, client = apiClient) {
  const response = await client.post('/api/auth/logout', refreshToken ? { refreshToken } : {});
  return response.data;
}

export async function fetchCurrentUser(client = apiClient) {
  const response = await client.get('/api/users/me');
  return response.data?.data;
}

/** Register (or clear, with null) this device for push notifications. */
export async function registerPushToken(expoPushToken, client = apiClient) {
  const response = await client.put('/api/users/me/push-token', { expoPushToken });
  return response.data?.data;
}
