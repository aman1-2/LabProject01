// backend/src/utils/redisGeoHelper.js
import { getRedisClient } from '../config/redisConfig.js';
import logger from './logger.js';

// In-memory fallback store for environments without native Redis GEO (e.g. ioredis-mock in unit/integration tests)
const fallbackGeoMap = new Map();

/**
 * Calculates great-circle distance between two coordinates in kilometers using Haversine formula
 */
export function calculateDistanceKm(lat1, lon1, lat2, lon2) {
  const R = 6371; // Earth radius in km
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLon / 2) *
      Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

/**
 * Add / update rider location in Redis geo set
 * Redis GEOADD takes (longitude, latitude, member)
 */
export async function addRiderLocation({ labCenterId, riderId, lat, lng }) {
  const client = getRedisClient();
  const key = `riders:geo:${labCenterId}`;
  const riderIdStr = riderId.toString();

  // Always mirror in fallback map for seamless mock testing
  if (!fallbackGeoMap.has(key)) {
    fallbackGeoMap.set(key, new Map());
  }
  fallbackGeoMap.get(key).set(riderIdStr, { lat: Number(lat), lng: Number(lng) });

  try {
    if (typeof client.geoadd === 'function') {
      await client.geoadd(key, lng, lat, riderIdStr);
    }
  } catch (err) {
    logger.debug('Native Redis geoadd failed, relying on fallback store', { error: err.message });
  }

  return true;
}

/**
 * Remove rider from Redis geo set
 */
export async function removeRiderLocation({ labCenterId, riderId }) {
  const client = getRedisClient();
  const key = `riders:geo:${labCenterId}`;
  const riderIdStr = riderId.toString();

  if (fallbackGeoMap.has(key)) {
    fallbackGeoMap.get(key).delete(riderIdStr);
  }

  try {
    if (typeof client.zrem === 'function') {
      await client.zrem(key, riderIdStr);
    }
  } catch (err) {
    logger.debug('Redis zrem failed', { error: err.message });
  }
}

/**
 * Find nearby riders within radiusKm, sorted nearest-first (ASC)
 * Returns array of { riderId: string, distanceKm: number }
 */
export async function findNearbyRiders({ labCenterId, lat, lng, radiusKm }) {
  const client = getRedisClient();
  const key = `riders:geo:${labCenterId}`;
  const targetLat = Number(lat);
  const targetLng = Number(lng);
  const maxRadius = Number(radiusKm);

  let rawResults = null;

  try {
    // 1. Try Redis 6.2+ GEOSEARCH
    if (typeof client.geosearch === 'function') {
      rawResults = await client.geosearch(
        key,
        'FROMLONLAT',
        targetLng,
        targetLat,
        'BYRADIUS',
        maxRadius,
        'km',
        'ASC',
        'WITHDIST'
      );
    }
  } catch {
    // GEOSEARCH might throw in mock or older Redis, fall back
    rawResults = null;
  }

  if (!rawResults) {
    try {
      // 2. Try legacy GEORADIUS
      if (typeof client.georadius === 'function') {
        rawResults = await client.georadius(
          key,
          targetLng,
          targetLat,
          maxRadius,
          'km',
          'WITHDIST',
          'ASC'
        );
      }
    } catch {
      rawResults = null;
    }
  }

  if (Array.isArray(rawResults) && rawResults.length > 0) {
    return rawResults.map((entry) => {
      // entry is usually [riderId, distanceStr]
      if (Array.isArray(entry)) {
        return {
          riderId: entry[0],
          distanceKm: parseFloat(entry[1]),
        };
      }
      return {
        riderId: entry.member || entry,
        distanceKm: parseFloat(entry.distance || 0),
      };
    });
  }

  // 3. Fallback to in-memory store (active in tests / mocked environments)
  const store = fallbackGeoMap.get(key);
  if (!store || store.size === 0) {
    return [];
  }

  const results = [];
  for (const [riderIdStr, coords] of store.entries()) {
    const dist = calculateDistanceKm(targetLat, targetLng, coords.lat, coords.lng);
    if (dist <= maxRadius) {
      results.push({
        riderId: riderIdStr,
        distanceKm: dist,
      });
    }
  }

  // Sort nearest-first
  results.sort((a, b) => a.distanceKm - b.distanceKm);
  return results;
}

const fallbackThrottleMap = new Map();

/**
 * Throttle rider location pings (default 10s) via Redis SET EX NX or in-memory fallback
 */
export async function checkAndSetLocationThrottle(riderId, throttleSec = 10) {
  const client = getRedisClient();
  const riderIdStr = riderId.toString();
  const key = `ratelimit:rider:loc:${riderIdStr}`;

  try {
    if (typeof client.set === 'function') {
      const result = await client.set(key, '1', 'EX', throttleSec, 'NX');
      if (result) {
        return true;
      }
      if (result === null) {
        return false;
      }
    }
  } catch {
    // Redis unavailable/mocked, fallback to memory
  }

  const now = Date.now();
  const lastTime = fallbackThrottleMap.get(riderIdStr);
  if (lastTime && now - lastTime < throttleSec * 1000) {
    return false;
  }

  fallbackThrottleMap.set(riderIdStr, now);
  return true;
}

/**
 * Clear the geo cache/store and throttle map (useful in tests)
 */
export async function clearGeoStore(labCenterId) {
  fallbackThrottleMap.clear();
  const client = getRedisClient();
  if (labCenterId) {
    const key = `riders:geo:${labCenterId}`;
    fallbackGeoMap.delete(key);
    try {
      if (typeof client.del === 'function') {
        await client.del(key);
      }
    } catch {
      // ignore in tests
    }
  } else {
    fallbackGeoMap.clear();
    try {
      if (typeof client.flushall === 'function') {
        await client.flushall();
      }
    } catch {
      // ignore
    }
  }
}

export const redisGeoHelper = {
  calculateDistanceKm,
  addRiderLocation,
  removeRiderLocation,
  findNearbyRiders,
  checkAndSetLocationThrottle,
  clearGeoStore,
};

export default redisGeoHelper;

