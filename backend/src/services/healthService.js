import { isDBConnected } from '../config/dbConfig.js';
import { checkRedisHealth, getRedisStatus } from '../config/redisConfig.js';

export async function checkHealth() {
  const dbStatus = isDBConnected() ? 'connected' : 'disconnected';
  const redisStatus = (await checkRedisHealth()) ? 'connected' : 'disconnected';

  const isHealthy = dbStatus === 'connected' && redisStatus === 'connected';

  return {
    status: isHealthy ? 'ok' : 'degraded',
    db: dbStatus,
    redis: redisStatus,
    // ioredis's view, so an operator can tell a blip from a dead client.
    redisState: getRedisStatus(),
    uptime: Math.floor(process.uptime()),
    timestamp: new Date().toISOString(),
  };
}

export default { checkHealth };
