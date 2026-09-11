import test from 'node:test';
import assert from 'node:assert';
import {
  getBundledTests,
  getBundledTestBySlug,
  getBundledCatalogueResponse,
  BUNDLED_SCHEMA_VERSION,
} from './bundledCatalogue.js';
import { loadCatalogue } from './loadCatalogue.js';

/**
 * The bundled catalogue loads instantly, then revalidates.
 *
 * The failure this guards against is a first launch that shows a spinner or an
 * empty screen while the network resolves — and the far worse one, a bundled
 * price surviving all the way to a charge.
 */

test('bundled catalogue is present and generated from real seed data', () => {
  const tests = getBundledTests();

  assert.ok(tests.length > 0, 'bundle must not be empty — the first screen depends on it');
  assert.strictEqual(BUNDLED_SCHEMA_VERSION, 1);

  // Real Dehradun catalogue entries, not placeholders (CONTEXT §3.1).
  const slugs = tests.map((t) => t.slug);
  assert.ok(slugs.includes('complete-blood-count-cbc'));
  assert.ok(slugs.includes('full-body-checkup-comprehensive'));

  // Nothing invented: no lorem, no "Test 1", no John Doe.
  for (const entry of tests) {
    assert.ok(entry.name && !/lorem|placeholder|john doe/i.test(entry.name), `bad name: ${entry.name}`);
    assert.ok(entry.description && entry.description.length > 20, `thin description: ${entry.slug}`);
  }
});

test('every bundled record is marked stale', () => {
  // This is what stops a bundled price reaching checkout.
  for (const entry of getBundledTests()) {
    assert.strictEqual(entry.isStale, true, `${entry.slug} is not marked stale`);
  }
  assert.strictEqual(getBundledTestBySlug('complete-blood-count-cbc').isStale, true);
});

test('bundled catalogue covers all four catalogue sections', () => {
  const categories = new Set(getBundledTests().map((t) => t.category));
  // DESIGN_SPEC §3.4: Full Body Checkups, Care Plans, Single Tests, Imaging.
  for (const expected of ['package', 'plan', 'single', 'imaging']) {
    assert.ok(categories.has(expected), `missing category: ${expected}`);
  }
});

test('bundled response filters by category and search like the API does', () => {
  const packages = getBundledCatalogueResponse({ category: 'package' });
  assert.ok(packages.items.length > 0);
  assert.ok(packages.items.every((i) => i.category === 'package'));
  assert.strictEqual(packages.isStale, true);

  const searched = getBundledCatalogueResponse({ search: 'thyroid' });
  assert.ok(searched.items.length > 0);
  assert.ok(searched.items.every((i) => /thyroid/i.test(i.name + i.description + i.tags.join(' '))));
});

test('loads bundled data first, then revalidates from the network', async () => {
  const emitted = [];
  const liveItems = [{ slug: 'complete-blood-count-cbc', name: 'CBC (live)', basePrice: 349, category: 'single' }];

  const result = await loadCatalogue({
    category: 'all',
    fetchLive: async () => ({ items: liveItems }),
    onUpdate: (payload) => emitted.push(payload),
  });

  // Two emissions, in this order: instant bundled, then live.
  assert.strictEqual(emitted.length, 2);
  assert.strictEqual(emitted[0].isStale, true);
  assert.ok(emitted[0].items.length > 1, 'first emission is the full bundle');
  assert.strictEqual(emitted[1].isStale, false);
  assert.deepStrictEqual(emitted[1].items, liveItems);

  // The resolved value is the LIVE one.
  assert.strictEqual(result.isStale, false);
  assert.strictEqual(result.items[0].basePrice, 349);
});

test('keeps showing bundled data when revalidation fails', async () => {
  const emitted = [];

  const result = await loadCatalogue({
    category: 'all',
    fetchLive: async () => {
      throw { code: 'NETWORK_ERROR', isNetworkError: true };
    },
    onUpdate: (payload) => emitted.push(payload),
  });

  // Offline on first launch is exactly the case the bundle exists for: the
  // patient still sees a catalogue rather than an error page.
  assert.strictEqual(emitted.length, 1);
  assert.strictEqual(result.isStale, true);
  assert.ok(result.items.length > 0);
  assert.strictEqual(result.revalidationFailed, true);
});
