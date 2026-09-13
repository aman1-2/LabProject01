import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { REAL_TESTS, REAL_LABS } from '../../src/scripts/seedCatalogue.js';

/**
 * HIGH H11 regression.
 *
 * The seed shipped three named doctors with invented clinics, invented phone
 * numbers and invented MEDICAL REGISTRATION NUMBERS (UK-MED-4491, UK-MED-5812,
 * UK-MED-3920), plus three lab centres with invented contact numbers and
 * invented NABL/ISO/ICMR accreditation and expiry dates.
 *
 * These upserted into the live collections and surfaced in the public doctor
 * directory. A registration number and an accreditation are regulatory
 * assertions about real-world entities, not placeholders (CONTEXT §3.1, §11).
 */
const HERE = path.dirname(fileURLToPath(import.meta.url));
const SEED_SCRIPT = path.resolve(HERE, '../../src/scripts/seedCatalogue.js');
const CATALOG_DATA = path.resolve(HERE, '../../../common/catalogData.js');

describe('Seed data carries no fabricated credentials (HIGH H11)', () => {
  const seedSource = fs.readFileSync(SEED_SCRIPT, 'utf8');
  const catalogSource = fs.readFileSync(CATALOG_DATA, 'utf8');

  describe('partner doctors', () => {
    it('seeds no doctors at all', () => {
      // Doctors are onboarded through the admin panel with verified credentials.
      expect(seedSource).not.toMatch(/Doctor\.findOneAndUpdate/);
      expect(seedSource).not.toMatch(/PARTNER_DOCTORS\s*=/);
    });

    it('contains none of the invented medical registration numbers', () => {
      for (const regNumber of ['UK-MED-4491', 'UK-MED-5812', 'UK-MED-3920']) {
        // Referenced only in the explanatory comment, never as data.
        expect(seedSource).not.toMatch(new RegExp(`regNumber:\\s*'${regNumber}'`));
      }
      expect(seedSource).not.toMatch(/regNumber:/);
    });

    it('contains no invented doctor names or phone numbers', () => {
      expect(seedSource).not.toMatch(/Dr\. Sanjay Sharma/);
      expect(seedSource).not.toMatch(/Dr\. Ananya Rawat/);
      expect(seedSource).not.toMatch(/Dr\. Vivek Joshi/);
      expect(seedSource).not.toMatch(/\+91 989\d{2} \d{5}/);
    });
  });

  describe('lab centres', () => {
    it('asserts no accreditation it cannot substantiate', () => {
      expect(catalogSource).not.toMatch(/accreditation:\s*\{/);
      for (const lab of REAL_LABS) {
        expect(lab.accreditation).toBeUndefined();
      }
    });

    it('carries no invented contact phone numbers', () => {
      for (const lab of REAL_LABS) {
        expect(lab.contactPhone).toBeUndefined();
      }
    });

    it('still carries the operational fields a booking needs', () => {
      expect(REAL_LABS.length).toBeGreaterThan(0);
      for (const lab of REAL_LABS) {
        expect(typeof lab.name).toBe('string');
        expect(typeof lab.area).toBe('string');
        expect(lab.geo?.coordinates).toHaveLength(2);
        expect(typeof lab.priceMultiplier).toBe('number');
      }
    });
  });

  describe('test catalogue', () => {
    it('is unchanged — legitimate business data per §3.1', () => {
      expect(REAL_TESTS.length).toBeGreaterThan(0);

      // Every entry has to be a real, priced, orderable product. Naming one
      // specific test here pinned the guard to a single launch region — the
      // move to Moradabad replaced the catalogue and this failed even though
      // the data was fine. Assert the shape that makes a row sellable instead.
      for (const t of REAL_TESTS) {
        expect(typeof t.name).toBe('string');
        expect(t.name.length).toBeGreaterThan(2);
        expect(t.slug).toMatch(/^[a-z0-9-]+$/);
        expect(typeof t.basePrice).toBe('number');
        expect(t.basePrice).toBeGreaterThan(0);
        expect(typeof t.turnaroundHrs).toBe('number');
        expect(typeof t.homeCollectionAvailable).toBe('boolean');
        // A scan is done at a centre; it must never be offered for home collection.
        if (t.category === 'imaging') {
          expect(t.homeCollectionAvailable).toBe(false);
        }
      }

      // Slugs address catalogue rows in URLs and carts; a duplicate silently
      // makes one of the two unreachable.
      const slugs = REAL_TESTS.map((t) => t.slug);
      expect(new Set(slugs).size).toBe(slugs.length);
    });
  });

  describe('production guard', () => {
    const ORIGINAL_ENV = process.env.NODE_ENV;

    afterEach(() => {
      process.env.NODE_ENV = ORIGINAL_ENV;
    });

    it('refuses to seed a production database', async () => {
      process.env.NODE_ENV = 'production';
      const { seedCatalogue } = await import('../../src/scripts/seedCatalogue.js');

      await expect(seedCatalogue()).rejects.toThrow(/Refusing to seed a production database/);
    });
  });
});
