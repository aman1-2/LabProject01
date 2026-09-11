import React, { createContext, useContext, useState, useEffect, useCallback, useMemo, useRef } from 'react';
import axios from 'axios';

const AuthContext = createContext(null);

const api = axios.create({
  baseURL: import.meta.env.VITE_API_URL || 'http://localhost:5000',
  withCredentials: true, // Send httpOnly cookies with requests
  headers: {
    'Content-Type': 'application/json',
  },
});

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [accessToken, setAccessToken] = useState(null); // In-memory only per security specifications
  const [isLoading, setIsLoading] = useState(true);

  // Set Authorization header whenever in-memory accessToken changes
  useEffect(() => {
    const interceptor = api.interceptors.request.use((config) => {
      if (accessToken) {
        config.headers.Authorization = `Bearer ${accessToken}`;
      }
      return config;
    });

    return () => api.interceptors.request.eject(interceptor);
  }, [accessToken]);

  /**
   * The one refresh in flight, shared by everything that needs one.
   *
   * A ref, not state: it must be readable and writable synchronously from
   * inside an interceptor, and changing it must not re-render.
   */
  const refreshInFlight = useRef(null);

  /**
   * Refreshes the session, or joins the refresh already running.
   *
   * Refresh tokens rotate on use, so two concurrent calls mean the second
   * presents a token the first has already consumed — and is rejected as a
   * replay. Everything funnels through here so there is only ever one.
   */
  const refreshSession = useCallback(async () => {
    if (!refreshInFlight.current) {
      refreshInFlight.current = api
        .post('/api/auth/refresh')
        .then(({ data }) => {
          setAccessToken(data.token);
          setUser(data.user);
          return data.token;
        })
        .finally(() => {
          // Cleared whether it worked or not: a failed refresh must not pin a
          // rejected promise that every later caller then inherits.
          refreshInFlight.current = null;
        });
    }
    return refreshInFlight.current;
  }, []);

  // Handle transparent 401 token refresh
  useEffect(() => {
    const interceptor = api.interceptors.response.use(
      (response) => response,
      async (error) => {
        const originalRequest = error.config;
        if (
          error.response?.status === 401 &&
          !originalRequest._retry &&
          !originalRequest.url?.includes('/auth/login') &&
          !originalRequest.url?.includes('/auth/refresh')
        ) {
          originalRequest._retry = true;
          try {
            // Joins the refresh already running rather than starting a second
            // one that would be rejected as a replay of a rotated token.
            const token = await refreshSession();
            originalRequest.headers.Authorization = `Bearer ${token}`;
            return api(originalRequest);
          } catch (refreshErr) {
            setAccessToken(null);
            setUser(null);
            return Promise.reject(refreshErr);
          }
        }
        return Promise.reject(error);
      }
    );

    return () => api.interceptors.response.eject(interceptor);
  }, [refreshSession]);

  // Silent session refresh on initial mount
  useEffect(() => {
    let isMounted = true;
    async function initAuth() {
      try {
        // Same shared promise as the interceptor, so a request that 401s while
        // this is still in flight waits for it instead of racing it.
        await refreshSession();
      } catch {
        // No active session in httpOnly cookie
      } finally {
        if (isMounted) setIsLoading(false);
      }
    }

    initAuth();
    return () => {
      isMounted = false;
    };
  }, [refreshSession]);

  // API operations
  const checkHandleAvailable = useCallback(async (handle) => {
    const { data } = await api.post('/api/auth/handle-available', { handle });
    return data.available;
  }, []);

  const signup = useCallback(async (payload) => {
    const { data } = await api.post('/api/auth/signup', payload);
    return data;
  }, []);

  const verifyOtp = useCallback(async (otpToken, otp) => {
    const { data } = await api.post('/api/auth/verify-otp', { otpToken, otp });
    setAccessToken(data.token);
    setUser(data.user);
    return data;
  }, []);

  const loginWithPassword = useCallback(async (accountHandle, password) => {
    const { data } = await api.post('/api/auth/login', { accountHandle, password });
    setAccessToken(data.token);
    setUser(data.user);
    return data;
  }, []);

  const loginWithOtp = useCallback(async (phone) => {
    const { data } = await api.post('/api/auth/login/otp', { phone });
    return data;
  }, []);

  const verifyLoginOtp = useCallback(async (otpToken, otp) => {
    const { data } = await api.post('/api/auth/login/verify-otp', { otpToken, otp });
    setAccessToken(data.token);
    setUser(data.user);
    return data;
  }, []);

  const logout = useCallback(async () => {
    try {
      await api.post('/api/auth/logout');
    } catch {
      // ignore
    } finally {
      setAccessToken(null);
      setUser(null);
    }
  }, []);

  const updateUser = useCallback((userData) => {
    setUser((prev) => (prev ? { ...prev, ...userData } : userData));
  }, []);

  const value = useMemo(
    () => ({
      user,
      accessToken,
      isAuthenticated: !!accessToken && !!user,
      isLoading,
      api,
      checkHandleAvailable,
      signup,
      verifyOtp,
      loginWithPassword,
      loginWithOtp,
      verifyLoginOtp,
      logout,
      updateUser,
    }),
    [
      user,
      accessToken,
      isLoading,
      checkHandleAvailable,
      signup,
      verifyOtp,
      loginWithPassword,
      loginWithOtp,
      verifyLoginOtp,
      logout,
      updateUser,
    ]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}

export default AuthContext;
