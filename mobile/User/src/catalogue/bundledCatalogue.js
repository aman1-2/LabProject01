import bundled from './bundledCatalogue.data.js';

/**
 * The catalogue that ships inside the binary.
 *
 * Purpose is one thing only: the first launch, before any network call has
 * returned, shows a real catalogue instead of a spinner or a blank screen
 * (CONTEXT §7.3). It is generated from `common/catalogData.js` — the same
 * source that seeds the database — by scripts/buildBundledCatalogue.js.
 *
 * Everything here is marked `isStale: true` so that no caller can accidentally
 * treat it as live. In particular nothing derived from it may reach a payment:
 * §7.3 is explicit — "Never charge using a cached or pre-bundled price."
 */

export const BUNDLED_SCHEMA_VERSION = bundled.schemaVersion;
export const BUNDLED_CAPTURED_AT = bundled.capturedAt;

/** Marks every record as not-live so a stale price can never masquerade as current. */
function markStale(test) {
  return { ...test, isStale: true, capturedAt: bundled.capturedAt };
}

export function getBundledTests({ category = 'all' } = {}) {
  const tests = bundled.tests.map(markStale);
  if (category === 'all') return tests;
  return tests.filter((test) => test.category === category);
}

export function getBundledTestBySlug(slug) {
  const found = bundled.tests.find((test) => test.slug === slug);
  return found ? markStale(found) : null;
}

export function getBundledLabs() {
  return bundled.labs.map((lab) => ({ ...lab, isStale: true }));
}

/**
 * Shaped like the API's list response so a screen can render bundled and live
 * data through one code path, rather than branching on which it received.
 */
export function getBundledCatalogueResponse({ category = 'all', search = '' } = {}) {
  let items = getBundledTests({ category });

  if (search) {
    const needle = search.trim().toLowerCase();
    items = items.filter(
      (test) =>
        test.name.toLowerCase().includes(needle) ||
        test.description?.toLowerCase().includes(needle) ||
        test.tags?.some((tag) => tag.toLowerCase().includes(needle))
    );
  }

  return {
    items,
    isStale: true,
    capturedAt: bundled.capturedAt,
    pagination: { total: items.length, page: 1, limit: items.length, totalPages: 1 },
  };
}

export default bundled;
