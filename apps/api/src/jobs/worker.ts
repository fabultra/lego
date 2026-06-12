/**
 * Worker BullMQ — processus séparé de l'API :
 *   npm run dev:worker
 *
 * Concurrency basse : le pipeline est CPU-bound (quelques centaines de ms
 * par modèle aujourd'hui, davantage quand la segmentation ML arrivera).
 */
import { Worker } from 'bullmq';
import { processGeneration } from './generation';
import { importRebrickable } from './importRebrickable';
import { MAINTENANCE_QUEUE_NAME, QUEUE_NAME, redisConnection, type GenerationJobData } from './queue';

const worker = new Worker<GenerationJobData>(
  QUEUE_NAME,
  async (job) => {
    console.log(`[worker] job ${job.id} — projet ${job.data.projectId}`);
    await processGeneration(job.data.projectId, (pct) => job.updateProgress(pct));
  },
  { connection: redisConnection(), concurrency: 2 },
);

const maintenanceWorker = new Worker(
  MAINTENANCE_QUEUE_NAME,
  async (job) => {
    if (job.name === 'import-rebrickable') {
      const report = await importRebrickable((msg) => console.log(`[import] ${msg}`));
      return report as unknown as object;
    }
    console.warn(`[worker] tâche de maintenance inconnue : ${job.name}`);
  },
  { connection: redisConnection(), concurrency: 1 },
);

worker.on('completed', (job) => console.log(`[worker] job ${job.id} terminé`));
worker.on('failed', (job, err) => console.error(`[worker] job ${job?.id} échec : ${err.message}`));
maintenanceWorker.on('failed', (job, err) =>
  console.error(`[worker] maintenance ${job?.name} échec : ${err.message}`),
);

console.log(`[worker] en écoute sur la file "${QUEUE_NAME}"`);

for (const sig of ['SIGINT', 'SIGTERM'] as const) {
  process.on(sig, async () => {
    // Fermeture bornée : ne jamais bloquer un arrêt (redéploiement) si Redis
    // est injoignable.
    await Promise.race([
      Promise.all([worker.close(), maintenanceWorker.close()]),
      new Promise((r) => setTimeout(r, 5000)),
    ]);
    process.exit(0);
  });
}
