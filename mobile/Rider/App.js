import React from 'react';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import { QueryClientProvider } from '@tanstack/react-query';
import { createQueryClient } from '@pathcare/api';
import { AuthProvider } from './src/auth/AuthContext.jsx';
import { OutboxProvider } from './src/offline/OutboxContext.jsx';
import RootNavigator from './src/navigation/RootNavigator.jsx';

/**
 * PathCare Rider — the phlebotomist app.
 *
 * Provider order matters: AuthProvider configures the shared API client (base
 * URL, token injection, refresh) before anything below it can issue a request,
 * and the outbox sends through that same client.
 */
const queryClient = createQueryClient();

export default function App() {
  return (
    <SafeAreaProvider>
      <QueryClientProvider client={queryClient}>
        <AuthProvider>
          <OutboxProvider>
            <StatusBar style="dark" />
            <RootNavigator />
          </OutboxProvider>
        </AuthProvider>
      </QueryClientProvider>
    </SafeAreaProvider>
  );
}
