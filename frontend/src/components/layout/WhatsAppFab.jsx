import React from 'react';
import { isFeatureEnabled } from '../../utils/featureFlags.js';

/**
 * Persistent WhatsApp FAB conforming to DESIGN_SPEC §5:
 * 56px, green token, bottom-right, 22px inset on every patient-facing page.
 */
// Configured per environment (VITE_WHATSAPP_NUMBER, digits only, e.g. 911234567890).
// The number was previously hardcoded to a placeholder, so every "Book on
// WhatsApp" click on every patient page went to a number PathCare does not own
// (CONTEXT §3.4, §11).
// Read at render time, not module load: a module-level const is captured once
// per process, which makes the component untestable and means config changes
// need a full reload to take effect.
function supportNumber() {
  return (import.meta.env?.VITE_WHATSAPP_NUMBER || '').replace(/[^0-9]/g, '');
}

export function WhatsAppFab() {
  const SUPPORT_WHATSAPP_NUMBER = supportNumber();

  // CONTEXT §3.5: user-facing feature behind a flag defaulting to false, so it
  // can be withdrawn with an env change rather than a code change.
  if (!isFeatureEnabled('WHATSAPP_FAB')) {
    return null;
  }

  // No number configured means no button, rather than a button that misdirects.
  if (!SUPPORT_WHATSAPP_NUMBER) {
    return null;
  }

  const handleClick = () => {
    const text = encodeURIComponent('Hi PathCare, I would like to book a test');
    window.open(
      `https://wa.me/${SUPPORT_WHATSAPP_NUMBER}?text=${text}`,
      '_blank',
      'noopener,noreferrer'
    );
  };

  return (
    <button
      type="button"
      onClick={handleClick}
      aria-label="Chat on WhatsApp"
      className="wa-fab group"
      title="Book or chat on WhatsApp"
    >
      <svg width="28" height="28" viewBox="0 0 24 24" fill="none">
        <path
          d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          className="text-white fill-current"
        />
      </svg>
    </button>
  );
}

export default WhatsAppFab;
