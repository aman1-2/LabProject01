import { describe, it, expect } from '@jest/globals';
import { calculateBookingPrice } from '../../src/services/pricingService.js';

describe('Pricing Service Unit Tests', () => {
  it('calculates exact price for a single test at baseline multiplier (1.0)', () => {
    const tests = [{ basePrice: 299 }]; // CBC basePrice
    const price = calculateBookingPrice({ tests, multiplier: 1.0 });
    expect(price).toBe(299);
  });

  it('correctly rounds to whole INR with fractional lab multipliers', () => {
    const tests = [{ basePrice: 299 }]; // CBC
    // 299 * 0.92 = 275.08 -> 275
    expect(calculateBookingPrice({ tests, multiplier: 0.92 })).toBe(275);
    // 299 * 0.85 = 254.15 -> 254
    expect(calculateBookingPrice({ tests, multiplier: 0.85 })).toBe(254);
  });

  it('sums multiple tests before applying lab multiplier', () => {
    // CBC (299) + Lipid Profile (499) = 798
    const tests = [{ basePrice: 299 }, { basePrice: 499 }];
    expect(calculateBookingPrice({ tests, multiplier: 1.0 })).toBe(798);
    // 798 * 0.92 = 734.16 -> 734
    expect(calculateBookingPrice({ tests, multiplier: 0.92 })).toBe(734);
  });

  it('calculates price for packages', () => {
    const packageItem = { basePrice: 1499 }; // Full Body Essential
    expect(calculateBookingPrice({ packageItem, multiplier: 1.0 })).toBe(1499);
    // 1499 * 0.92 = 1379.08 -> 1379
    expect(calculateBookingPrice({ packageItem, multiplier: 0.92 })).toBe(1379);
  });

  it('defaults to multiplier 1.0 if missing or invalid', () => {
    const tests = [{ basePrice: 500 }];
    expect(calculateBookingPrice({ tests, multiplier: null })).toBe(500);
    expect(calculateBookingPrice({ tests, multiplier: -0.5 })).toBe(500);
  });
});
