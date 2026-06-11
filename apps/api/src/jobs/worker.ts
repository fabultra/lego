/**
 * Worker BullMQ — processus séparé de l'API :
 *   npm run dev:worker
 *
 * Concurrency basse : le pipeline est CPU-bound (quelques centaines de ms
 * par modèle aujourd'hui, davantage quand la segmentation ML arrivera).
 */
import { Worker } from 'bullmq';
import { processGeneration } from './generation';
import { QUEUE_NAME, redisConnection, type GenerationJobData } from './queue';

const worker = new Worker<GenerationJobData>(
  QUEUE_NAME,
  async (job) => {
    console.log(`[worker] job ${job.id} — projet ${job.data.projectId}`);
    await processGeneration(job.data.projectId, (pct) => job.updateProgress(pct));
  },
  { connection: redisConnection(), concurrency: 2 },
);

worker.on('completed', (job) => console.log(`[worker] job ${job.id} terminé`));
worker.on('failed', (job, err) => console.error(`[worker] job ${job?.id} échec : ${err.message}`));

console.log(`[worker] en écoute sur la file "${QUEUE_NAME}"`);

for (const sig of ['SIGINT', 'SIGTERM'] as const) {
  process.on(sig, async () => {
    await worker.close();
    process.exit(0);
  });
}
