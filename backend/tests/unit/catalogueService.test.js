import { describe, it, expect, beforeEach, jest } from '@jest/globals';
import testRepository from '../../src/repositories/testRepository.js';
import labRepository from '../../src/repositories/labRepository.js';
import catalogueService from '../../src/services/catalogueService.js';
import { REAL_TESTS } from '../../src/scripts/seedCatalogue.js';

/**
 * Fixtures for the behaviour under test, defined here rather than pulled from
 * the seed catalogue.
 *
 * These are unit tests with mocked repositories: what they verify is arithmetic
 * and ordering, not which products the business happens to sell. Borrowing real
 * catalogue rows coupled them to it — when the launch region moved and the
 * catalogue was replaced, four tests failed despite the service being correct,
 * and the multiplier test quietly lost its teeth because every new lab shares a
 * multiplier of 1. Distinct multipliers below keep it discriminating.
 */
const FIXTURE_TEST = {
  name: 'Fixture Blood Panel',
  slug: 'fixture-blood-panel',
  category: 'single',
  sampleType: 'Blood',
  homeCollectionAvailable: true,
  basePrice: 299,
  turnaroundHrs: 6,
  description: 'Fixture used by unit tests.',
};

const FIXTURE_IMAGING = {
  name: 'Fixture Ultrasound',
  slug: 'fixture-ultrasound',
  category: 'imaging',
  sampleType: 'Imaging',
  // The property under test: a scan cannot be collected at home.
  homeCollectionAvailable: false,
  basePrice: 1200,
  turnaroundHrs: 24,
  description: 'Fixture used by unit tests.',
};

const FIXTURE_LABS = [
  { name: 'Fixture Lab A', area: 'A', address: 'A', geo: { type: 'Point', coordinates: [78.0418, 30.3256] }, priceMultiplier: 1.0,  turnaroundHrs: 6, isVerified: true },
  { name: 'Fixture Lab B', area: 'B', address: 'B', geo: { type: 'Point', coordinates: [78.0125, 30.3340] }, priceMultiplier: 0.92, turnaroundHrs: 8, isVerified: true },
  { name: 'Fixture Lab C', area: 'C', address: 'C', geo: { type: 'Point', coordinates: [78.0583, 30.3456] }, priceMultiplier: 0.85, turnaroundHrs: 12, isVerified: true },
];

describe('Catalogue Service Unit Tests', () => {
  beforeEach(() => {
    jest.restoreAllMocks();
  });

  describe('getTests', () => {
    it('returns paginated tests with category filtering and pagination metadata', async () => {
      const mockSingleTests = REAL_TESTS.filter((t) => t.category === 'single');
      jest.spyOn(testRepository, 'findTests').mockResolvedValue({
        items: mockSingleTests.slice(0, 10),
        total: mockSingleTests.length,
      });

      const result = await catalogueService.getTests({
        category: 'single',
        page: 1,
        limit: 10,
      });

      expect(result.items).toHaveLength(10);
      expect(result.pagination.total).toBe(mockSingleTests.length);
      expect(result.pagination.page).toBe(1);
      expect(result.pagination.totalPages).toBe(Math.ceil(mockSingleTests.length / 10));
    });

    it('filters by search keyword across test names and descriptions', async () => {
      jest.spyOn(testRepository, 'findTests').mockResolvedValue({
        items: [FIXTURE_TEST],
        total: 1,
      });

      const result = await catalogueService.getTests({
        search: 'Blood Panel',
        page: 1,
        limit: 10,
      });

      expect(result.items).toHaveLength(1);
      expect(result.items[0].name).toContain('Blood Panel');
    });
  });

  describe('getTestBySlug', () => {
    it('returns full test detail for a valid slug', async () => {
      jest.spyOn(testRepository, 'findTestBySlug').mockResolvedValue(FIXTURE_TEST);

      const result = await catalogueService.getTestBySlug('fixture-blood-panel');

      expect(result.name).toBe('Fixture Blood Panel');
      expect(result.homeCollectionAvailable).toBe(true);
      expect(result.basePrice).toBe(299);
      expect(result.turnaroundHrs).toBe(6);
    });

    it('throws 404 AppError when slug does not exist', async () => {
      jest.spyOn(testRepository, 'findTestBySlug').mockResolvedValue(null);

      await expect(catalogueService.getTestBySlug('non-existent-test')).rejects.toThrow(
        'Test not found in catalogue'
      );
    });
  });

  describe('getNearbyLabsForTest', () => {
    it('sorts labs by distance and applies priceMultiplier genuinely to calculate per-lab price', async () => {
      jest.spyOn(testRepository, 'findTestById').mockResolvedValue(FIXTURE_TEST);
      jest.spyOn(testRepository, 'findTestBySlug').mockResolvedValue(FIXTURE_TEST);
      jest.spyOn(labRepository, 'findAllVerifiedLabs').mockResolvedValue(FIXTURE_LABS);

      const result = await catalogueService.getNearbyLabsForTest({
        lat: 30.3256,
        lng: 78.0418,
        testId: 'fixture-blood-panel',
      });

      expect(result.test.name).toBe('Fixture Blood Panel');
      expect(result.labs).toHaveLength(3);

      // Verify distance ascending order
      for (let i = 0; i < result.labs.length - 1; i++) {
        expect(result.labs[i].distanceKm).toBeLessThanOrEqual(result.labs[i + 1].distanceKm);
      }

      // Each multiplier must produce a DIFFERENT price, or the assertion cannot
      // tell a working multiplier from one that is ignored:
      //   1.00 -> Math.round(299 * 1.00) = 299
      //   0.92 -> Math.round(299 * 0.92) = 275
      //   0.85 -> Math.round(299 * 0.85) = 254
      const a = result.labs.find((l) => l.name === 'Fixture Lab A');
      const b = result.labs.find((l) => l.name === 'Fixture Lab B');
      const c = result.labs.find((l) => l.name === 'Fixture Lab C');

      expect(a.price).toBe(299);
      expect(b.price).toBe(275);
      expect(c.price).toBe(254);
    });

    it('strictly preserves homeCollectionAvailable = false for imaging tests', async () => {
      jest.spyOn(testRepository, 'findTestBySlug').mockResolvedValue(FIXTURE_IMAGING);
      jest.spyOn(labRepository, 'findAllVerifiedLabs').mockResolvedValue(FIXTURE_LABS);

      const result = await catalogueService.getNearbyLabsForTest({
        lat: 30.3165,
        lng: 78.0322,
        testId: 'fixture-ultrasound',
      });

      expect(result.test.homeCollectionAvailable).toBe(false);
      expect(result.test.category).toBe('imaging');
      expect(result.test.sampleType).toBe('Imaging');
    });
  });
});
