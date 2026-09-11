/**
 * Generates the pre-bundled catalogue shipped inside the app binary.
 *
 * CONTEXT §7.3: "Pre-bundled catalogue JSON in the app bundle — no blank
 * screen" on first launch. This is NOT seeded fake data (§3.1): the test
 * catalogue is real business data, and this file is generated FROM the same
 * `common/catalogData.js` that seeds the database — never hand-written, so it
 * cannot drift into fiction.
 *
 * Prices are carried only so the first paint is not blank. They are display
 * values with a `capturedAt` stamp, and the checkout path re-fetches and
 * charges server-side regardless (§7.3: "Never charge using a cached or
 * pre-bundled price").
 *
 *   pnpm --filter @pathcare/mobile-user catalogue:bundle
 */
import { writeFileSync, mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { REAL_TESTS, REAL_LABS } from '../../../common/catalogData.js';

const here = dirname(fileURLToPath(import.meta.url));
/**
 * Emitted as a .js module rather than .json so the same file loads under both
 * Metro (the app) and Node's ESM loader (the tests). A bare JSON import needs
 * `with { type: 'json' }` in Node and must not have it in Metro; a module
 * sidesteps the incompatibility entirely.
 */
const OUTPUT = resolve(here, '../src/catalogue/bundledCatalogue.data.js');

/** Only what the first paint needs. The full record arrives with the refetch. */
function toBundledTest(test) {
  return {
    name: test.name,
    slug: test.slug,
    category: test.category,
    sampleType: test.sampleType,
    homeCollectionAvailable: test.homeCollectionAvailable,
    basePrice: test.basePrice,
    strikePrice: test.strikePrice ?? null,
    turnaroundHrs: test.turnaroundHrs,
    parametersCount: test.parametersCount ?? 0,
    description: test.description,
    prepInstructions: test.prepInstructions,
    isPopular: Boolean(test.isPopular),
    tags: test.tags ?? [],
  };
}

function toBundledLab(lab) {
  return {
    name: lab.name,
    area: lab.area,
    accreditation: lab.accreditation ?? { nabl: false, iso: false },
    turnaroundHrs: lab.turnaroundHrs ?? null,
  };
}

const payload = {
  // Bumped whenever the shape changes, so a stale persisted cache is discarded
  // rather than merged into a structure that no longer matches.
  schemaVersion: 1,
  capturedAt: new Date().toISOString(),
  source: 'common/catalogData.js',
  /**
   * Read this before showing a bundled price anywhere near a payment.
   * It is here to make the constraint impossible to miss in the data itself.
   */
  priceDisclaimer:
    'Display only. Prices are confirmed server-side at checkout and may differ by lab centre.',
  tests: REAL_TESTS.map(toBundledTest),
  labs: REAL_LABS.map(toBundledLab),
};

mkdirSync(dirname(OUTPUT), { recursive: true });
const banner = [
  '// GENERATED FILE - DO NOT EDIT BY HAND.',
  '// Regenerate with: pnpm --filter @pathcare/mobile-user catalogue:bundle',
  '// Source: common/catalogData.js (the same data that seeds the database).',
  '',
  '',
].join('\n');

writeFileSync(OUTPUT, `${banner}export default ${JSON.stringify(payload, null, 2)};\n`, 'utf8');

const byCategory = payload.tests.reduce((acc, test) => {
  acc[test.category] = (acc[test.category] || 0) + 1;
  return acc;
}, {});

process.stdout.write(
  `Bundled catalogue written to src/catalogue/bundledCatalogue.data.js\n` +
    `  ${payload.tests.length} tests (${Object.entries(byCategory)
      .map(([k, v]) => `${k}: ${v}`)
      .join(', ')})\n` +
    `  ${payload.labs.length} lab centres\n`
);
