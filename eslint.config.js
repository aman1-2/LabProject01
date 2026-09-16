import js from '@eslint/js';
import globals from 'globals';
import importPlugin from 'eslint-plugin-import';
import react from 'eslint-plugin-react';
import reactHooks from 'eslint-plugin-react-hooks';

/**
 * ESLint configuration (HIGH H13).
 *
 * Before this, `lint` was `echo "... lint ok"` in every package and
 * .github/workflows/ci.yml ran it as a step that could never fail. That is why
 * a case-mismatched import that stops the API booting on Linux (BLOCKER #3), an
 * unused model import, and an unused dependency all survived fourteen features.
 *
 * The rules below are chosen from what this audit actually found, not from a
 * generic style preset.
 */
export default [
  {
    ignores: [
      '**/node_modules/**',
      '**/dist/**',
      '**/build/**',
      '**/coverage/**',
      'frontend/public/**',
      'pathcare_v3_prototype.html',
      'pathcare_mobile_prototype.html',
      'infra/**',
      'scratch_*.py',
    ],
  },

  js.configs.recommended,

  // ── Shared rules ──────────────────────────────────────────────────────────
  {
    files: ['**/*.{js,jsx}'],
    plugins: { import: importPlugin },
    languageOptions: {
      ecmaVersion: 2023,
      sourceType: 'module',
      parserOptions: { ecmaFeatures: { jsx: true } },
    },
    settings: {
      'import/resolver': { node: { extensions: ['.js', '.jsx'] } },
    },
    rules: {
      /**
       * THE rule this codebase needed. `caseSensitiveStrict` compares the
       * specifier against the real directory entry, so it catches
       * '../utils/appError.js' against a file named 'AppError.js' even on a
       * case-insensitive filesystem — the developer machines where BLOCKER #3
       * was invisible.
       */
      'import/no-unresolved': [
        'error',
        {
          caseSensitive: true,
          caseSensitiveStrict: true,
          /**
           * Packages the Node resolver cannot see from the workspace root under
           * pnpm's symlinked layout, or that only exist inside another runtime
           * (k6, Expo, Playwright). Relative imports — the BLOCKER #3 class —
           * are still fully checked, which is the guarantee that matters.
           */
          ignore: [
            '^@jest/globals$',
            '^vitest',
            '^expo',
            '^@playwright/test$',
            '^k6',
            '^@react-navigation/',
            '^react-native',
          ],
        },
      ],
      'import/no-duplicates': 'error',
      'import/no-self-import': 'error',

      'no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_', caughtErrors: 'none' },
      ],
      eqeqeq: ['error', 'smart'],

      /**
       * Only report when EVERY destructured binding could be const. The default
       * ('any') flags `let [hours, minutes] = ...` because `minutes` is never
       * reassigned, even though `hours` is — which cannot be satisfied.
       */
      'prefer-const': ['error', { destructuring: 'all' }],

      /**
       * Downgraded from the recommended 'error'. It flags defensive
       * `let x = null;` initialisation that is then assigned in every branch —
       * a reasonable pattern, and the occurrences are in the refund and sample
       * paths where churning code for style is risk without benefit.
       */
      'no-useless-assignment': 'warn',
      'no-var': 'error',
    },
  },

  // ── Backend ───────────────────────────────────────────────────────────────
  {
    files: ['backend/src/**/*.js'],
    languageOptions: { globals: { ...globals.node } },
    rules: {
      // CONTEXT §9.6: no console in shipped code — the structured logger with
      // PII redaction is the only sanctioned output.
      'no-console': 'error',
    },
  },

  // Scripts are operator tools run by hand; console output is their interface.
  {
    files: ['backend/src/scripts/**/*.js'],
    rules: { 'no-console': 'off' },
  },

  // Tooling configs live outside src/ and so matched no block, leaving them
  // without Node globals — `process.env` in jest.config.js read as undefined.
  {
    files: [
      '**/jest.config.js',
      '**/metro.config.js',
      '**/babel.config.js',
      '**/vite.config.js',
      '**/vitest.config.js',
      '**/*.config.cjs',
      // Repo scripts that are run with `node`, not bundled. Without this they
      // matched no block at all, so `console` and `process` — the only two
      // things a script like this is made of — were reported as undefined.
      'docs/**/*.mjs',
      'scripts/**/*.{js,mjs}',
    ],
    languageOptions: { globals: { ...globals.node } },
  },

  // ── Frontend ──────────────────────────────────────────────────────────────
  {
    files: ['frontend/src/**/*.{js,jsx}'],
    plugins: { react, 'react-hooks': reactHooks },
    languageOptions: {
      globals: { ...globals.browser },
    },
    settings: { react: { version: 'detect' } },
    rules: {
      // §9.6 again. Warn rather than error for now: the 13 pre-existing
      // occurrences are LOW L2 and are not part of this change.
      'no-console': 'warn',
      'react/jsx-uses-react': 'error',
      'react/jsx-uses-vars': 'error',
      /**
       * `<StepTrail />` with no import for it shipped to a device and threw
       * "Property 'StepTrail' doesn't exist" at the moment the rider opened
       * the screen — lint was green the whole time. `no-undef` does not see
       * JSX component names; this rule does.
       */
      'react/jsx-no-undef': 'error',
    },
  },

  // ── Shared packages ───────────────────────────────────────────────────────
  {
    files: ['common/**/*.js'],
    languageOptions: { globals: { ...globals.node, ...globals.browser } },
  },

  // ── Mobile ────────────────────────────────────────────────────────────────
  {
    // .jsx was missing here, so every React Native screen fell through to the
    // shared block with no react plugin and every JSX-only import was reported
    // as an unused variable.
    files: ['mobile/**/*.{js,jsx}'],
    plugins: { react, 'react-hooks': reactHooks },
    // __DEV__ is injected by the React Native runtime, not by Node or a
    // browser, so neither globals set declares it.
    languageOptions: {
      globals: { ...globals.node, ...globals.browser, __DEV__: 'readonly' },
    },
    settings: { react: { version: 'detect' } },
    rules: {
      'no-console': 'warn',
      // Expo module resolution (platform extensions, the Metro resolver) is not
      // something the Node resolver models, so unresolved findings here would
      // be about the bundler rather than the code.
      'import/no-unresolved': 'off',
      'no-unused-vars': 'warn',
      'react/jsx-uses-react': 'error',
      'react/jsx-uses-vars': 'error',
      /**
       * `<StepTrail />` with no import for it shipped to a device and threw
       * "Property 'StepTrail' doesn't exist" at the moment the rider opened
       * the screen — lint was green the whole time. `no-undef` does not see
       * JSX component names; this rule does.
       */
      'react/jsx-no-undef': 'error',
      // These two catch the real defects in a hooks codebase: a stale closure
      // over a token, or an effect that re-subscribes every render.
      'react-hooks/rules-of-hooks': 'error',
      'react-hooks/exhaustive-deps': 'warn',
    },
  },

  // Detox drives a built app; its globals come from the runner, not from Node.
  {
    files: ['mobile/**/e2e/**/*.js'],
    languageOptions: {
      sourceType: 'commonjs',
      globals: { ...globals.node, ...globals.jest, device: 'readonly', element: 'readonly', by: 'readonly', waitFor: 'readonly' },
    },
    rules: { 'no-unused-vars': 'warn' },
  },

  // k6 and Playwright configs execute inside their own runners, not Node.
  {
    files: ['tests/**/*.js'],
    languageOptions: { globals: { ...globals.node, __ENV: 'readonly' } },
    rules: { 'import/no-unresolved': 'off', 'no-unused-vars': 'warn' },
  },

  // ── Tests ─────────────────────────────────────────────────────────────────
  {
    files: ['**/tests/**/*.{js,jsx}', '**/*.test.{js,jsx}'],
    plugins: { react },
    languageOptions: {
      globals: { ...globals.node, ...globals.jest, ...globals.browser },
    },
    settings: { react: { version: 'detect' } },
    rules: {
      'no-console': 'off',
      'no-unused-vars': 'warn',
      // Test files live outside frontend/src, so they were not picked up by the
      // frontend block and every JSX-only import — React, the component under
      // test — was reported as unused. Sixty false warnings make the real ones
      // invisible.
      'react/jsx-uses-react': 'error',
      'react/jsx-uses-vars': 'error',
      /**
       * `<StepTrail />` with no import for it shipped to a device and threw
       * "Property 'StepTrail' doesn't exist" at the moment the rider opened
       * the screen — lint was green the whole time. `no-undef` does not see
       * JSX component names; this rule does.
       */
      'react/jsx-no-undef': 'error',
    },
  },
];
