import type { NextFunction, Request, Response } from 'express';
import { ZodError } from 'zod';

export class ApiError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: string,
    message: string,
  ) {
    super(message);
  }

  static notFound(what = 'Ressource'): ApiError {
    return new ApiError(404, 'NOT_FOUND', `${what} introuvable.`);
  }
  static badRequest(message: string): ApiError {
    return new ApiError(400, 'BAD_REQUEST', message);
  }
  static unauthorized(message = 'Authentification requise.'): ApiError {
    return new ApiError(401, 'UNAUTHORIZED', message);
  }
  static conflict(message: string): ApiError {
    return new ApiError(409, 'CONFLICT', message);
  }
}

export function errorHandler(err: unknown, _req: Request, res: Response, _next: NextFunction): void {
  if (err instanceof ApiError) {
    res.status(err.status).json({ error: { code: err.code, message: err.message } });
    return;
  }
  if (err instanceof ZodError) {
    res.status(400).json({
      error: { code: 'VALIDATION', message: 'Requête invalide.', details: err.flatten() },
    });
    return;
  }
  console.error('[api] erreur non gérée :', err);
  res.status(500).json({ error: { code: 'INTERNAL', message: 'Erreur interne.' } });
}

/** Wrapper pour les handlers async (Express 4 ne catch pas les rejets). */
export function asyncHandler<T extends Request>(
  fn: (req: T, res: Response, next: NextFunction) => Promise<unknown>,
) {
  return (req: Request, res: Response, next: NextFunction) => {
    fn(req as T, res, next).catch(next);
  };
}
