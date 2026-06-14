import cors from 'cors';
import express from 'express';
import { resolve } from 'node:path';
import { config } from './config';
import { errorHandler } from './errors';
import { adminRouter } from './routes/admin';
import { exportsRouter } from './routes/exports';
import { inventoryRouter } from './routes/inventory';
import { projectsRouter } from './routes/projects';

export function createApp(): express.Express {
  const app = express();
  app.use(cors());
  app.use(express.json({ limit: '2mb' }));

  // Page d'accueil de l'API : un humain qui clique l'URL doit comprendre
  // où il est (l'app mobile, elle, utilise les routes ci-dessous).
  app.get('/', (_req, res) => {
    res.json({
      service: 'Brickify AI — API',
      status: 'ok',
      hint: "Cette URL est l'API du backend : elle se consomme depuis l'app mobile (EXPO_PUBLIC_API_URL).",
      endpoints: {
        health: 'GET /healthz',
        projects: 'POST /projects · GET /projects · GET /projects/:id',
        images: 'POST /projects/:id/images',
        generation: 'POST /projects/:id/generate · GET /projects/:id/status',
        results: 'GET /projects/:id/model · /pieces · /instructions',
        inventory: 'GET|POST /inventory',
        exports: 'POST /exports/bricklink · POST /exports/studio',
      },
      source: 'https://github.com/fabultra/lego',
    });
  });

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
  app.use('/admin', adminRouter);

  app.use(errorHandler);
  return app;
}
