import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import { QueryClientProvider } from '@tanstack/react-query';
import { defaultQueryClient, configureApi } from '@pathcare/api';
import App from './App.jsx';
import ErrorBoundary from './components/ErrorBoundary.jsx';
import './index.css';

// The shared client reads no build-time globals of its own — `import.meta.env`
// is Vite-only and breaks the Expo bundler — so the web app hands its own
// configuration in here. The web session lives in an httpOnly cookie, so no
// token provider is registered.
configureApi({
  baseUrl: import.meta.env.VITE_API_URL || 'http://localhost:5000',
});

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <QueryClientProvider client={defaultQueryClient}>
      <BrowserRouter>
        {/* Inside the router so the fallback can offer a real way back. */}
        <ErrorBoundary>
          <App />
        </ErrorBoundary>
      </BrowserRouter>
    </QueryClientProvider>
  </React.StrictMode>
);
