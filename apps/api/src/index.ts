import { createApp } from './app';
import { config } from './config';

const app = createApp();

// Arrêt gracieux : Railway envoie SIGTERM à chaque remplacement de
// déploiement — on ferme proprement et on sort en code 0, sinon l'arrêt
// est compté comme un crash dans le dashboard. Borné à 5s.
const server = app.listen(config.port, () => {
  console.log(`[api] Brickify AI sur http://localhost:${config.port} (auth: ${config.auth.mode}, storage: ${config.storage.driver})`);
  if (!config.embedWorker) {
    console.log('[api] Penser à lancer le worker : npm run dev:worker');
  }
});

if (config.embedWorker) {
  // Déploiement mono-service (ex. Railway MVP) : le worker tourne dans ce
  // processus et partage le même système de fichiers que l'API.
  // (jobs/worker enregistre ses propres handlers SIGTERM, eux aussi bornés.)
  await import('./jobs/worker');
  console.log('[api] worker BullMQ embarqué (EMBED_WORKER=true)');
}

for (const sig of ['SIGINT', 'SIGTERM'] as const) {
  process.on(sig, async () => {
    console.log(`[api] ${sig} reçu — arrêt gracieux`);
    await Promise.race([
      new Promise((r) => server.close(r)),
      new Promise((r) => setTimeout(r, 5000)),
    ]);
    process.exit(0);
  });
}
