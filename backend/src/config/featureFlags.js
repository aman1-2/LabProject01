/**
 * Feature Flag Helper
 * "Every new user-facing feature ships behind a flag defaulting to false."
 */

/**
 * @param {string} flagName
 * @param {Object} [options]
 * @param {boolean} [options.defaultValue=false] - Value when the env var is unset.
 *
 * A NEW user-facing feature ships behind a flag defaulting to false.
 * An ALREADY-SHIPPED feature is different: defaulting it to false is not a
 * rollback, it is a removal — the flag's purpose is "a rollback becomes an
 * env-var change", which needs the shipped behaviour on by default and the flag
 * available to switch it off. Pass defaultValue: true for those kill switches.
 */
export function isFeatureEnabled(flagName, { defaultValue = false } = {}) {
  if (!flagName || typeof flagName !== 'string') {
    return false;
  }

  // Normalize: 'DYNAMIC_DISPATCH' or 'FF_DYNAMIC_DISPATCH' or 'dynamicDispatch'
  const cleanName = flagName
    .replace(/^FF_/i, '')
    .toUpperCase()
    .replace(/[^A-Z0-9_]/g, '_');

  const envKey = `FF_${cleanName}`;
  const envVal = process.env[envKey];

  if (envVal === undefined || envVal === null || envVal === '') {
    return defaultValue;
  }

  const normalized = String(envVal).trim().toLowerCase();
  if (normalized === 'true' || normalized === '1') return true;
  if (normalized === 'false' || normalized === '0') return false;

  // An unrecognised value must not silently flip a shipped feature off.
  return defaultValue;
}

export function getAllFeatureFlags() {
  const flags = {};
  for (const [key, val] of Object.entries(process.env)) {
    if (key.startsWith('FF_')) {
      const flagName = key.replace('FF_', '');
      flags[flagName] = val.toLowerCase() === 'true' || val === '1';
    }
  }
  return flags;
}

export default { isFeatureEnabled, getAllFeatureFlags };
