import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';

/**
 * Production builds must name a real API.
 *
 * `main.jsx` falls back to `http://localhost:5000` when VITE_API_URL is unset.
 * That is right for local work and fatal on Vercel: the deploy succeeds, the
 * page renders, and every request goes to the visitor's own machine. Nothing
 * in the build output says so — the first sign is users reporting a dead app.
 *
 * Vercel injects environment variables at build time, so the check belongs
 * here, where an unset variable fails the deploy instead of shipping it.
 */
export default defineConfig(({ mode, command }) => {
  const env = loadEnv(mode, process.cwd(), '');
  const isProductionBuild = command === 'build' && mode === 'production';

  if (isProductionBuild) {
    const apiUrl = (env.VITE_API_URL || '').trim();
    const problems = [];

    if (!apiUrl) {
      problems.push('VITE_API_URL is not set — the bundle would call http://localhost:5000');
    } else {
      if (/localhost|127\.0\.0\.1/.test(apiUrl)) {
        problems.push(`VITE_API_URL points at a local address ("${apiUrl}")`);
      }
      if (!/^https:\/\//.test(apiUrl)) {
        problems.push(`VITE_API_URL must be https in production (got "${apiUrl}")`);
      }
    }

    const razorpayKey = (env.VITE_RAZORPAY_KEY_ID || '').trim();
    if (razorpayKey.startsWith('rzp_test_')) {
      problems.push('VITE_RAZORPAY_KEY_ID is a TEST key — checkout would take no real money');
    }
    if (razorpayKey.includes('placeholder')) {
      problems.push('VITE_RAZORPAY_KEY_ID is still the placeholder from .env.example');
    }

    if (problems.length) {
      throw new Error(
        'Refusing to build for production:\n' + problems.map((p) => `  - ${p}`).join('\n')
      );
    }
  }

  return {
    plugins: [react()],
    server: { port: 5173 },
  };
});
