import type { NextFunction, Request, Response } from 'express';
import { jwtVerify } from 'jose';
import { config } from './config';
import { prisma } from './db';
import { ApiError, asyncHandler } from './errors';

/**
 * Authentification :
 *  - mode 'dev' : toutes les requêtes sont attribuées à un utilisateur local
 *    (créé à la volée) — aucun token requis. Pratique pour le MVP et les tests.
 *  - mode 'supabase' : vérifie le JWT (HS256, secret partagé Supabase) et
 *    upsert l'utilisateur à partir de `sub` / `email`.
 *
 * Clerk / Firebase Auth : même contrat — ajouter un vérificateur dans ce
 * fichier sans toucher aux routes.
 */

export interface AuthedRequest extends Request {
  userId: string;
}

const DEV_EMAIL = 'dev@brickify.local';
let devUserId: string | null = null;

export const requireAuth = asyncHandler(async (req: Request, _res: Response, next: NextFunction) => {
  if (config.auth.mode === 'dev') {
    if (!devUserId) {
      const u = await prisma.user.upsert({
        where: { email: DEV_EMAIL },
        create: { email: DEV_EMAIL },
        update: {},
      });
      devUserId = u.id;
    }
    (req as AuthedRequest).userId = devUserId;
    next();
    return;
  }

  const header = req.headers.authorization;
  if (!header?.startsWith('Bearer ')) throw ApiError.unauthorized();
  const token = header.slice('Bearer '.length);
  try {
    const secret = new TextEncoder().encode(config.auth.supabaseJwtSecret);
    const { payload } = await jwtVerify(token, secret);
    const sub = payload.sub;
    const email = (payload.email as string | undefined) ?? `${sub}@unknown.local`;
    if (!sub) throw ApiError.unauthorized('Jeton sans sujet.');
    const user = await prisma.user.upsert({
      where: { id: sub },
      create: { id: sub, email },
      update: { email },
    });
    (req as AuthedRequest).userId = user.id;
    next();
  } catch (e) {
    if (e instanceof ApiError) throw e;
    throw ApiError.unauthorized('Jeton invalide ou expiré.');
  }
});
