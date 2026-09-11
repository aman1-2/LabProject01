import React, { useEffect, useState } from 'react';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import { QueryClientProvider } from '@tanstack/react-query';
import { createQueryClient } from '@pathcare/api';
import { AuthProvider } from './src/auth/AuthContext.jsx';
import { CartProvider } from './src/catalogue/CartContext.jsx';
import { startQueryPersistence } from './src/offline/queryPersistence.js';
import RootNavigator from './src/navigation/RootNavigator.jsx';

/**
 * PathCare — the patient app.
 *
 * AuthProvider configures the shared API client (base URL, token injection,
 * refresh) before anything below it issues a request.
 *
 * The query cache is persisted to SQLite (CONTEXT §7.3) so a patient with no
 * signal still sees the catalogue they browsed and the booking they are
 * tracking. Rendering waits for the restore so the first frame is the cached
 * data rather than a spinner that is immediately replaced.
 */
const queryClient = createQueryClient();

export default function App() {
  const [cacheReady, setCacheReady] = useState(false);

  useEffect(() => {
    let cancelled = false;
    const { unsubscribe, restored } = startQueryPersistence(queryClient);

    restored
      .catch(() => {
        // A cache that will not restore is not a reason to refuse to start.
      })
      .finally(() => {
        if (!cancelled) setCacheReady(true);
      });

    return () => {
      cancelled = true;
      unsubscribe?.();
    };
  }, []);

  return (
    <SafeAreaProvider>
      <QueryClientProvider client={queryClient}>
        <AuthProvider>
          <CartProvider>
          <StatusBar style="dark" />
          {/* Until the cache is read, AuthProvider is still restoring the
              session anyway, so the splash covers both. */}
          <RootNavigator cacheReady={cacheReady} />
          </CartProvider>
        </AuthProvider>
      </QueryClientProvider>
    </SafeAreaProvider>
  );
}
