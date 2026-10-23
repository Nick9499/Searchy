import type { ConnectionOptions } from 'bullmq';
import { env } from './env';

export const redisConnection: ConnectionOptions = {
  host: env.REDIS_HOST,
  port: env.REDIS_PORT,
  maxRetriesPerRequest: null,
};
