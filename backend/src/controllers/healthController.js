import { checkHealth } from '../services/healthService.js';

/**
 * Load-balancer health check.
 *
 * The status code is what an ALB target group acts on; it does not read the
 * body. This used to compute `health.status === 'ok' ? 200 : 200` — a no-op
 * ternary that always answered 200, so an instance with a DEAD DATABASE
 * reported itself healthy and the load balancer kept sending it traffic that
 * could only 500.
 *
 * The two dependencies are not equal, so they are not treated equally:
 *
 *   MongoDB   — hard. Nothing works without it, so the instance must be pulled
 *               out of rotation: 503.
 *   Redis     — soft. Rate limiting falls back to an in-memory store, the cache
 *               misses, queued work waits. Degraded but serving, and failing
 *               the check would pull EVERY instance out at once over a
 *               dependency the app is explicitly built to survive: still 200.
 */
export async function getHealth(req, res, next) {
  try {
    const health = await checkHealth();
    const dbUp = health.db === 'connected';
    return res.status(dbUp ? 200 : 503).json(health);
  } catch (error) {
    next(error);
  }
}

export default { getHealth };
