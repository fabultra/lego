import { Queue, type ConnectionOptions } from 'bullmq';
import { config } from '../config';

export interface GenerationJobData {
  projectId: string;
}

export const QUEUE_NAME = 'generation';

/**
 * Options de connexion dérivées de REDIS_URL. On passe des options plutôt
 * qu'une instance ioredis pour laisser BullMQ gérer ses propres connexions
 * (et éviter tout conflit de version ioredis).
 */
export function redisConnection(): ConnectionOptions {
  const u = new URL(config.redisUrl);
  return {
    host: u.hostname,
    port: u.port ? parseInt(u.port, 10) : 6379,
    username: u.username || undefined,
    password: u.password || undefined,
    db: u.pathname && u.pathname !== '/' ? parseInt(u.pathname.slice(1), 10) : 0,
    // requis par BullMQ :
    maxRetriesPerRequest: null,
  };
}

export const generationQueue = new Queue<GenerationJobData>(QUEUE_NAME, {
  connection: redisConnection(),
  defaultJobOptions: {
    attempts: 2,
    backoff: { type: 'exponential', delay: 3000 },
    removeOnComplete: { age: 24 * 3600, count: 500 },
    removeOnFail: { age: 7 * 24 * 3600 },
  },
});
