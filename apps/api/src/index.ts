import { createApp } from './app';
import { config } from './config';

const app = createApp();

app.listen(config.port, () => {
  console.log(`[api] Brickify AI sur http://localhost:${config.port} (auth: ${config.auth.mode}, storage: ${config.storage.driver})`);
  console.log('[api] Penser à lancer le worker : npm run dev:worker');
});
