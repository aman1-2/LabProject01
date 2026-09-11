import { getRedisClient, isRedisConnected } from '../config/redisConfig.js';
import logger from './logger.js';

const CATALOGUE_CACHE_PREFIX = 'cache:catalogue:';
const DEFAULT_TTL_SECONDS = 300; // 5 minutes TTL per prompt

export async function getOrSetCache(key, ttlSeconds = DEFAULT_TTL_SECONDS, fetcherFn) {
  const fullKey = `${CATALOGUE_CACHE_PREFIX}${key}`;

  try {
    const connected = await isRedisConnected();
    if (connected) {
      const redis = getRedisClient();
      const cached = await redis.get(fullKey);
      if (cached) {
        return JSON.parse(cached);
      }
    }
  } catch (err) {
    logger.warn('Cache read error, falling back to database', { error: err.message, key: fullKey });
  }

  // Execute database fetcher
  const freshData = await fetcherFn();

  // Try to write to cache
  if (freshData !== undefined && freshData !== null) {
    try {
      const connected = await isRedisConnected();
      if (connected) {
        const redis = getRedisClient();
        await redis.setex(fullKey, ttlSeconds, JSON.stringify(freshData));
      }
    } catch (err) {
      logger.warn('Cache write error', { error: err.message, key: fullKey });
    }
  }

  return freshData;
}

export async function purgeCatalogueCache() {
  try {
    const connected = await isRedisConnected();
    if (!connected) return;

    const redis = getRedisClient();
    const keys = await redis.keys(`${CATALOGUE_CACHE_PREFIX}*`);
    if (keys.length > 0) {
      await redis.del(...keys);
      logger.info('Catalogue cache purged successfully', { count: keys.length });
    }
  } catch (err) {
    logger.error('Failed to purge catalogue cache', { error: err.message });
  }
}

export default {
  getOrSetCache,
  purgeCatalogueCache,
};
