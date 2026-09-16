import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: './tests/setup.js',
    /**
     * The locale settings a deployment supplies. src/lib/locale.js keeps no
     * hardcoded fallback — that is the point — so without these the suite
     * renders a blank city and the assertions that read CITY compare against
     * an empty string.
     *
     * Values chosen to differ from any real deployment: a test that only
     * passes because it happens to match production config is not testing the
     * wiring.
     */
    env: {
      VITE_CITY: 'Testville',
      VITE_STATE: 'Test State',
      VITE_SAMPLE_AREA: 'Test Area',
      VITE_DEFAULT_LAT: '28.8386',
      VITE_DEFAULT_LNG: '78.7733',
    },
  },
});
