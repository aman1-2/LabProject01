// backend/tests/unit/riderOrdering.test.js
import { describe, it, expect, beforeEach } from '@jest/globals';
import {
  calculateDistanceKm,
  addRiderLocation,
  findNearbyRiders,
  clearGeoStore,
} from '../../src/utils/redisGeoHelper.js';

describe('Unit: Candidate Ordering & Redis Geo Search', () => {
  const labCenterId = '507f1f77bcf86cd799439011';
  // Central Bangalore: 12.9716° N, 77.5946° E
  const centerLat = 12.9716;
  const centerLng = 77.5946;

  beforeEach(async () => {
    await clearGeoStore(labCenterId);
  });

  it('calculates Haversine distance correctly between two coordinates', () => {
    // Distance between Bangalore (12.9716, 77.5946) and Indiranagar (~12.9784, 77.6408) is ~5.0 km
    const dist = calculateDistanceKm(12.9716, 77.5946, 12.9784, 77.6408);
    expect(dist).toBeGreaterThan(4.5);
    expect(dist).toBeLessThan(5.5);
  });

  it('orders candidates strictly nearest-first (ASC by distance)', async () => {
    // Rider 1: ~1.2 km away
    const rider1Id = '607f1f77bcf86cd799439001';
    await addRiderLocation({
      labCenterId,
      riderId: rider1Id,
      lat: 12.9810,
      lng: 77.5980,
    });

    // Rider 2: ~3.5 km away
    const rider2Id = '607f1f77bcf86cd799439002';
    await addRiderLocation({
      labCenterId,
      riderId: rider2Id,
      lat: 12.9950,
      lng: 77.6150,
    });

    // Rider 3: ~0.5 km away (closest)
    const rider3Id = '607f1f77bcf86cd799439003';
    await addRiderLocation({
      labCenterId,
      riderId: rider3Id,
      lat: 12.9740,
      lng: 77.5960,
    });

    // Rider 4: ~8.0 km away (further out)
    const rider4Id = '607f1f77bcf86cd799439004';
    await addRiderLocation({
      labCenterId,
      riderId: rider4Id,
      lat: 13.0400,
      lng: 77.6200,
    });

    // Search within 5km radius
    const candidates5km = await findNearbyRiders({
      labCenterId,
      lat: centerLat,
      lng: centerLng,
      radiusKm: 5,
    });

    // Rider 4 (>5km) must not be in 5km radius results
    expect(candidates5km.length).toBe(3);

    // Candidates must be ordered strictly nearest-first: Rider 3, then Rider 1, then Rider 2
    expect(candidates5km[0].riderId).toBe(rider3Id);
    expect(candidates5km[1].riderId).toBe(rider1Id);
    expect(candidates5km[2].riderId).toBe(rider2Id);

    // Distances must be strictly increasing
    expect(candidates5km[0].distanceKm).toBeLessThan(candidates5km[1].distanceKm);
    expect(candidates5km[1].distanceKm).toBeLessThan(candidates5km[2].distanceKm);

    // When searching with 10km radius, Rider 4 is included at the end
    const candidates10km = await findNearbyRiders({
      labCenterId,
      lat: centerLat,
      lng: centerLng,
      radiusKm: 10,
    });

    expect(candidates10km.length).toBe(4);
    expect(candidates10km[3].riderId).toBe(rider4Id);
  });
});
