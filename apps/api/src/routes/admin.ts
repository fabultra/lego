import { Router } from 'express';
import { requireAuth } from '../auth';
import { asyncHandler } from '../errors';
import { maintenanceQueue } from '../jobs/queue';

/**
 * Routes d'administration (MVP : protégées par l'auth standard ; à
 * restreindre à un rôle admin quand l'auth Supabase sera active).
 */
export const adminRouter = Router();
adminRouter.use(requireAuth);

// Déclenche l'import du catalogue Rebrickable (long : plusieurs minutes,
// suivi dans les logs du worker). Idempotent.
adminRouter.post(
  '/import-rebrickable',
  asyncHandler(async (_req, res) => {
    const job = await maintenanceQueue.add('import-rebrickable', {});
    res.status(202).json({ jobId: job.id, status: 'queued', hint: 'suivre les logs du worker' });
  }),
);
