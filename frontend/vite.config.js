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

    /**
     * Locale settings have no hardcoded fallback in src/lib/locale.js, so a
     * missing one would ship a blank city name or NaN coordinates. Coordinates
     * especially: NaN reaches the lab search as `lat=NaN`, which returns
     * nothing and looks to a patient like "no labs serve you".
     */
    for (const [key, label] of [
      ['VITE_CITY', 'the city name shown throughout the UI'],
      ['VITE_STATE', 'the state, used in the footer'],
      ['VITE_SAMPLE_AREA', 'the example locality used in address placeholders'],
    ]) {
      if (!(env[key] || '').trim()) problems.push(`${key} is not set — ${label}`);
    }
    for (const key of ['VITE_DEFAULT_LAT', 'VITE_DEFAULT_LNG']) {
      const raw = (env[key] || '').trim();
      if (!raw) {
        problems.push(`${key} is not set — the map and lab search would start from NaN`);
      } else if (Number.isNaN(Number(raw))) {
        problems.push(`${key} is not a number (got "${raw}")`);
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
