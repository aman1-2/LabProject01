import { describe, it, expect, beforeEach, jest } from '@jest/globals';
import testRepository from '../../src/repositories/testRepository.js';
import labRepository from '../../src/repositories/labRepository.js';
import catalogueService from '../../src/services/catalogueService.js';
import { REAL_TESTS, REAL_LABS } from '../../src/scripts/seedCatalogue.js';

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
      const cbcTest = REAL_TESTS.find((t) => t.slug === 'complete-blood-count-cbc');
      jest.spyOn(testRepository, 'findTests').mockResolvedValue({
        items: [cbcTest],
        total: 1,
      });

      const result = await catalogueService.getTests({
        search: 'CBC',
        page: 1,
        limit: 10,
      });

      expect(result.items).toHaveLength(1);
      expect(result.items[0].name).toContain('Complete Blood Count');
    });
  });

  describe('getTestBySlug', () => {
    it('returns full test detail for a valid slug', async () => {
      const cbcTest = REAL_TESTS.find((t) => t.slug === 'complete-blood-count-cbc');
      jest.spyOn(testRepository, 'findTestBySlug').mockResolvedValue(cbcTest);

      const result = await catalogueService.getTestBySlug('complete-blood-count-cbc');

      expect(result.name).toBe('Complete Blood Count (CBC)');
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
      const cbcTest = REAL_TESTS.find((t) => t.slug === 'complete-blood-count-cbc'); // basePrice: 299
      jest.spyOn(testRepository, 'findTestById').mockResolvedValue(cbcTest);
      jest.spyOn(testRepository, 'findTestBySlug').mockResolvedValue(cbcTest);
      jest.spyOn(labRepository, 'findAllVerifiedLabs').mockResolvedValue(REAL_LABS);

      // Dehradun Clock Tower center reference coords: 30.3256, 78.0418
      const result = await catalogueService.getNearbyLabsForTest({
        lat: 30.3256,
        lng: 78.0418,
        testId: 'complete-blood-count-cbc',
      });

      expect(result.test.name).toBe('Complete Blood Count (CBC)');
      expect(result.labs).toHaveLength(3);

      // Verify distance ascending order
      for (let i = 0; i < result.labs.length - 1; i++) {
        expect(result.labs[i].distanceKm).toBeLessThanOrEqual(result.labs[i + 1].distanceKm);
      }

      // Verify priceMultiplier application:
      // Sunrise Diagnostics (mult: 1.0) -> Math.round(299 * 1.0) = 299
      // Doon Path Labs (mult: 0.92) -> Math.round(299 * 0.92) = 275
      // Himalaya Medicare (mult: 0.85) -> Math.round(299 * 0.85) = 254
      const sunrise = result.labs.find((l) => l.name === 'Sunrise Diagnostics');
      const doon = result.labs.find((l) => l.name === 'Doon Path Labs');
      const himalaya = result.labs.find((l) => l.name === 'Himalaya Medicare');

      expect(sunrise.price).toBe(299);
      expect(doon.price).toBe(275);
      expect(himalaya.price).toBe(254);
    });

    it('strictly preserves homeCollectionAvailable = false for imaging tests', async () => {
      const ultrasound = REAL_TESTS.find((t) => t.slug === 'ultrasound-whole-abdomen');
      jest.spyOn(testRepository, 'findTestBySlug').mockResolvedValue(ultrasound);
      jest.spyOn(labRepository, 'findAllVerifiedLabs').mockResolvedValue(REAL_LABS);

      const result = await catalogueService.getNearbyLabsForTest({
        lat: 30.3165,
        lng: 78.0322,
        testId: 'ultrasound-whole-abdomen',
      });

      expect(result.test.homeCollectionAvailable).toBe(false);
      expect(result.test.category).toBe('imaging');
      expect(result.test.sampleType).toBe('Imaging');
    });
  });
});
