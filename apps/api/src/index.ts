import { createApp } from './app';
import { config } from './config';

const app = createApp();

app.listen(config.port, () => {
  console.log(`[api] Brickify AI sur http://localhost:${config.port} (auth: ${config.auth.mode}, storage: ${config.storage.driver})`);
  if (!config.embedWorker) {
    console.log('[api] Penser à lancer le worker : npm run dev:worker');
  }
});

if (config.embedWorker) {
  // Déploiement mono-service (ex. Railway MVP) : le worker tourne dans ce
  // processus et partage le même système de fichiers que l'API.
  await import('./jobs/worker');
  console.log('[api] worker BullMQ embarqué (EMBED_WORKER=true)');
}
