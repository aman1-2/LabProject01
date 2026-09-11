// frontend/src/utils/featureFlags.js

/**
 * Feature flags for the web client (CONTEXT §3.5).
 *
 * The backend had `config/featureFlags.js`; the frontend had no equivalent at
 * all, so a user-facing feature had nowhere to put a flag even if someone
 * wanted one. Vite only exposes variables prefixed `VITE_`, and inlines them at
 * build time, so a flag change is a rebuild for the SPA — still an env change
 * rather than a code change, which is what §3.5 asks for.
 *
 * @param {string} flagName - 'WHATSAPP_FAB' or 'VITE_FF_WHATSAPP_FAB'
 * @param {Object} [options]
 * @param {boolean} [options.defaultValue=false] - Value when the variable is unset.
 *   Defaults to false per §3.5. Pass true only for an already-shipped feature,
 *   where the flag is a kill switch rather than a removal.
 */
export function isFeatureEnabled(flagName, { defaultValue = false } = {}) {
  if (!flagName || typeof flagName !== 'string') {
    return false;
  }

  const cleanName = flagName
    .replace(/^VITE_FF_/i, '')
    .replace(/^FF_/i, '')
    .toUpperCase()
    .replace(/[^A-Z0-9_]/g, '_');

  const envKey = `VITE_FF_${cleanName}`;
  const env = typeof import.meta !== 'undefined' ? import.meta.env : undefined;
  const raw = env ? env[envKey] : undefined;

  if (raw === undefined || raw === null || raw === '') {
    return defaultValue;
  }

  const normalized = String(raw).trim().toLowerCase();
  if (normalized === 'true' || normalized === '1') return true;
  if (normalized === 'false' || normalized === '0') return false;

  return defaultValue;
}

export default { isFeatureEnabled };
