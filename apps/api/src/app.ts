import cors from 'cors';
import express from 'express';
import { resolve } from 'node:path';
import { config } from './config';
import { errorHandler } from './errors';
import { exportsRouter } from './routes/exports';
import { inventoryRouter } from './routes/inventory';
import { projectsRouter } from './routes/projects';

export function createApp(): express.Express {
  const app = express();
  app.use(cors());
  app.use(express.json({ limit: '2mb' }));

  app.get('/healthz', (_req, res) => {
    res.json({ ok: true, service: 'brickify-api' });
  });

  // Fichiers (mode stockage local uniquement ; en S3, les URLs sont signées).
  if (config.storage.driver === 'local') {
    app.use('/files', express.static(resolve(config.storage.localDir), { maxAge: '1h' }));
  }

  app.use('/projects', projectsRouter);
  app.use('/inventory', inventoryRouter);
  app.use('/exports', exportsRouter);

  app.use(errorHandler);
  return app;
}
