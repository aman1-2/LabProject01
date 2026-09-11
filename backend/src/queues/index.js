import { Queue } from 'bullmq';
import { getQueueConnection } from '../config/redisConfig.js';

export const queues = {};

export function createQueue(name) {
  if (!queues[name]) {
    queues[name] = new Queue(name, {
      connection: getQueueConnection(),
    });
  }
  return queues[name];
}

export default { queues, createQueue };
