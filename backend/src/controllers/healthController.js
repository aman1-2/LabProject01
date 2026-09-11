import { checkHealth } from '../services/healthService.js';

export async function getHealth(req, res, next) {
  try {
    const health = await checkHealth();
    const statusCode = health.status === 'ok' ? 200 : 200; // Return 200 with degraded indicators
    return res.status(statusCode).json(health);
  } catch (error) {
    next(error);
  }
}

export default { getHealth };
