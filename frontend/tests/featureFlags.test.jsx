import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { isFeatureEnabled } from '../src/utils/featureFlags.js';
import WhatsAppFab from '../src/components/layout/WhatsAppFab.jsx';

/**
 * HIGH H14 regression (frontend half).
 *
 * The backend had a feature-flag helper; the frontend had none at all, so a
 * user-facing feature had nowhere to put a flag even if someone wanted one.
 * Fourteen features shipped with zero flags, so §3.5's rollback story — "a flag
 * turns a rollback from a redeploy into an env-var change" — did not exist.
 */
describe('Frontend feature flags (HIGH H14)', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  describe('isFeatureEnabled', () => {
    it('defaults to false when the variable is unset (§3.5)', () => {
      vi.stubEnv('VITE_FF_WHATSAPP_FAB', '');
      expect(isFeatureEnabled('WHATSAPP_FAB')).toBe(false);
    });

    it('honours an explicit true', () => {
      vi.stubEnv('VITE_FF_WHATSAPP_FAB', 'true');
      expect(isFeatureEnabled('WHATSAPP_FAB')).toBe(true);

      vi.stubEnv('VITE_FF_WHATSAPP_FAB', '1');
      expect(isFeatureEnabled('WHATSAPP_FAB')).toBe(true);
    });

    it('honours an explicit false', () => {
      vi.stubEnv('VITE_FF_WHATSAPP_FAB', 'false');
      expect(isFeatureEnabled('WHATSAPP_FAB')).toBe(false);
    });

    it('accepts the full VITE_FF_ prefix as well as the bare name', () => {
      vi.stubEnv('VITE_FF_WHATSAPP_FAB', 'true');
      expect(isFeatureEnabled('VITE_FF_WHATSAPP_FAB')).toBe(true);
      expect(isFeatureEnabled('WHATSAPP_FAB')).toBe(true);
    });

    it('supports a kill-switch default for shipped features', () => {
      vi.stubEnv('VITE_FF_SOME_SHIPPED_THING', '');
      expect(isFeatureEnabled('SOME_SHIPPED_THING', { defaultValue: true })).toBe(true);
    });

    it('returns false for a missing or non-string flag name', () => {
      expect(isFeatureEnabled(undefined)).toBe(false);
      expect(isFeatureEnabled(42)).toBe(false);
      expect(isFeatureEnabled('')).toBe(false);
    });
  });

  describe('the WhatsApp FAB is actually gated', () => {
    it('does not render when the flag is off, even with a number configured', () => {
      vi.stubEnv('VITE_WHATSAPP_NUMBER', '919999999999');
      vi.stubEnv('VITE_FF_WHATSAPP_FAB', 'false');

      const { container } = render(<WhatsAppFab />);
      expect(container).toBeEmptyDOMElement();
    });

    it('does not render when the flag is unset (default off)', () => {
      vi.stubEnv('VITE_WHATSAPP_NUMBER', '919999999999');
      vi.stubEnv('VITE_FF_WHATSAPP_FAB', '');

      const { container } = render(<WhatsAppFab />);
      expect(container).toBeEmptyDOMElement();
    });

    it('renders when the flag is on and a number is configured', () => {
      vi.stubEnv('VITE_WHATSAPP_NUMBER', '919999999999');
      vi.stubEnv('VITE_FF_WHATSAPP_FAB', 'true');

      render(<WhatsAppFab />);
      expect(screen.getByRole('button')).toBeInTheDocument();
    });

    it('still refuses to render with the flag on but no number (H10)', () => {
      vi.stubEnv('VITE_WHATSAPP_NUMBER', '');
      vi.stubEnv('VITE_FF_WHATSAPP_FAB', 'true');

      const { container } = render(<WhatsAppFab />);
      expect(container).toBeEmptyDOMElement();
    });
  });
});
