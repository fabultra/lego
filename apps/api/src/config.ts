/** Configuration centralisée, lue une fois depuis l'environnement. */

function env(name: string, fallback?: string): string {
  const v = process.env[name] ?? fallback;
  if (v === undefined) throw new Error(`Variable d'environnement manquante : ${name}`);
  return v;
}

export const config = {
  port: parseInt(env('PORT', '3000'), 10),
  nodeEnv: env('NODE_ENV', 'development'),
  databaseUrl: env('DATABASE_URL', 'postgresql://brickify:brickify@localhost:5432/brickify'),
  redisUrl: env('REDIS_URL', 'redis://localhost:6379'),
  /** URL publique de l'API (pour construire les URLs de fichiers en mode local). */
  publicBaseUrl: env('PUBLIC_BASE_URL', `http://localhost:${env('PORT', '3000')}`),
  storage: {
    driver: env('STORAGE_DRIVER', 'local') as 'local' | 's3',
    localDir: env('STORAGE_LOCAL_DIR', './storage'),
    s3: {
      endpoint: process.env.S3_ENDPOINT,
      region: env('S3_REGION', 'us-east-1'),
      bucket: env('S3_BUCKET', 'brickify'),
      accessKey: env('S3_ACCESS_KEY', ''),
      secretKey: env('S3_SECRET_KEY', ''),
    },
  },
  auth: {
    /** 'dev' : utilisateur unique injecté ; 'supabase' : vérification JWT HS256. */
    mode: env('AUTH_MODE', 'dev') as 'dev' | 'supabase',
    supabaseJwtSecret: env('SUPABASE_JWT_SECRET', 'change-me'),
  },
  limits: {
    maxUploadBytes: 12 * 1024 * 1024,
    /** côté long max de l'image source conservée. */
    maxImageDim: 1280,
  },
} as const;
