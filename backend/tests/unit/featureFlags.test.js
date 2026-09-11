import { isFeatureEnabled } from '../../src/config/featureFlags.js';

describe('Feature Flags Helper', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    process.env = { ...originalEnv };
  });

  afterAll(() => {
    process.env = originalEnv;
  });

  it('should default to false when flag is not set', () => {
    expect(isFeatureEnabled('NON_EXISTENT_FLAG')).toBe(false);
    expect(isFeatureEnabled('')).toBe(false);
    expect(isFeatureEnabled(null)).toBe(false);
  });

  it('should return true when env variable is "true" or "1"', () => {
    process.env.FF_DYNAMIC_DISPATCH = 'true';
    process.env.FF_PRESCRIPTION_OCR = '1';

    expect(isFeatureEnabled('DYNAMIC_DISPATCH')).toBe(true);
    expect(isFeatureEnabled('FF_DYNAMIC_DISPATCH')).toBe(true);
    expect(isFeatureEnabled('dynamic_dispatch')).toBe(true);
    expect(isFeatureEnabled('PRESCRIPTION_OCR')).toBe(true);
  });

  it('should return false when env variable is "false" or anything else', () => {
    process.env.FF_DYNAMIC_DISPATCH = 'false';
    process.env.FF_RANDOM = 'some_other_value';

    expect(isFeatureEnabled('DYNAMIC_DISPATCH')).toBe(false);
    expect(isFeatureEnabled('RANDOM')).toBe(false);
  });
  // -- HIGH H14 regression ----------------------------------------------------
  // featureFlags.js existed, was unit-tested, and was called from ZERO places in
  // backend/src and zero in frontend/src. §3.5's rollback story ("a flag turns a
  // rollback from a redeploy into an env-var change") did not exist for any of
  // the fourteen shipped features.
  describe('HIGH H14 -- flags are actually wired to features', () => {
    it('supports a kill-switch default for already-shipped behaviour', () => {
      delete process.env.FF_DYNAMIC_DISPATCH;

      // Defaulting a SHIPPED feature to false is a removal, not a rollback.
      expect(isFeatureEnabled('DYNAMIC_DISPATCH', { defaultValue: true })).toBe(true);
      expect(isFeatureEnabled('DYNAMIC_DISPATCH')).toBe(false);
    });

    it('an explicit false turns a kill switch off', () => {
      process.env.FF_DYNAMIC_DISPATCH = 'false';
      expect(isFeatureEnabled('DYNAMIC_DISPATCH', { defaultValue: true })).toBe(false);

      process.env.FF_DYNAMIC_DISPATCH = '0';
      expect(isFeatureEnabled('DYNAMIC_DISPATCH', { defaultValue: true })).toBe(false);
    });

    it('an unrecognised value does not silently disable a shipped feature', () => {
      process.env.FF_DYNAMIC_DISPATCH = 'yes-please';
      // Neither 'true' nor 'false' -- fall back to the stated default rather
      // than treating anything non-'true' as off.
      expect(isFeatureEnabled('DYNAMIC_DISPATCH', { defaultValue: true })).toBe(true);
    });

    it('an empty string is treated as unset', () => {
      process.env.FF_DYNAMIC_DISPATCH = '';
      expect(isFeatureEnabled('DYNAMIC_DISPATCH', { defaultValue: true })).toBe(true);
      expect(isFeatureEnabled('DYNAMIC_DISPATCH', { defaultValue: false })).toBe(false);
    });

    it('bookingService consults the dispatch flag', async () => {
      // The point of the finding: the helper is imported and called by real
      // production code, not merely unit-tested in isolation.
      const fs = await import('node:fs');
      const url = await import('node:url');
      const path = await import('node:path');
      const here = path.dirname(url.fileURLToPath(import.meta.url));
      const src = fs.readFileSync(
        path.resolve(here, '../../src/services/bookingService.js'),
        'utf8'
      );

      expect(src).toContain("from '../config/featureFlags.js'");
      expect(src).toMatch(/isFeatureEnabled\('DYNAMIC_DISPATCH'/);
    });
  });
});
