/** Configuration centralisée, lue une fois depuis l'environnement. */

function env(name: string, fallback?: string): string {
  const v = process.env[name] ?? fallback;
  if (v === undefined) throw new Error(`Variable d'environnement manquante : ${name}`);
  return v;
}

/**
 * URL publique par défaut : sur Railway, RAILWAY_PUBLIC_DOMAIN est injecté
 * automatiquement — aucun réglage manuel de PUBLIC_BASE_URL nécessaire.
 */
const defaultPublicBaseUrl = process.env.RAILWAY_PUBLIC_DOMAIN
  ? `https://${process.env.RAILWAY_PUBLIC_DOMAIN}`
  : `http://localhost:${env('PORT', '3000')}`;

export const config = {
  port: parseInt(env('PORT', '3000'), 10),
  nodeEnv: env('NODE_ENV', 'development'),
  databaseUrl: env('DATABASE_URL', 'postgresql://brickify:brickify@localhost:5432/brickify'),
  redisUrl: env('REDIS_URL', 'redis://localhost:6379'),
  /** URL publique de l'API (pour construire les URLs de fichiers en mode local). */
  publicBaseUrl: env('PUBLIC_BASE_URL', defaultPublicBaseUrl),
  /**
   * EMBED_WORKER=true : démarre le worker BullMQ dans le même processus que
   * l'API. Pratique pour un déploiement mono-service (Railway MVP) où le
   * stockage local sur volume doit être partagé entre API et worker.
   * En scale-out : remettre à false et lancer un service worker dédié.
   */
  embedWorker: env('EMBED_WORKER', 'false') === 'true',
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
  /**
   * Segmentation ML (optionnelle) : si REPLICATE_API_TOKEN est défini, le
   * détourage passe par Replicate avec repli automatique sur l'heuristique.
   */
  replicate: {
    token: process.env.REPLICATE_API_TOKEN,
    segmentModel: env('REPLICATE_SEGMENT_MODEL', '851-labs/background-remover'),
    timeoutMs: parseInt(env('REPLICATE_TIMEOUT_MS', '45000'), 10),
    depthModel: env('REPLICATE_DEPTH_MODEL', 'chenxwh/depth-anything-v2'),
    /**
     * Le relief est un bonus : timeout court — un modèle froid (cold start
     * GPU de plusieurs minutes chez Replicate) ne doit pas retarder la
     * génération, on retombe sur le profil elliptique. Un modèle chaud
     * répond en quelques secondes.
     */
    depthTimeoutMs: parseInt(env('REPLICATE_DEPTH_TIMEOUT_MS', '25000'), 10),
  },
  /**
   * Profondeur LOCALE dans le worker (Depth Anything V2 Small, ONNX, CPU) :
   * relief réel sur 100% des générations sans cold start ni coût par photo.
   * Activée par défaut ; le modèle est téléchargé une fois puis mis en cache
   * sur le disque (volume persistant en prod). Désactivable via
   * DEPTH_LOCAL_ENABLED=false (repli Replicate ou profil elliptique).
   */
  depth: {
    localEnabled: env('DEPTH_LOCAL_ENABLED', 'true') === 'true',
    onnxModelUrl: env(
      'DEPTH_ONNX_MODEL_URL',
      'https://huggingface.co/onnx-community/depth-anything-v2-small/resolve/main/onnx/model.onnx',
    ),
    /** Chemin d'un modèle pré-embarqué : court-circuite le téléchargement. */
    onnxModelPath: process.env.DEPTH_ONNX_MODEL_PATH,
    /** Répertoire de cache du modèle (par défaut sous le stockage local). */
    modelDir: env('DEPTH_MODEL_DIR', `${env('STORAGE_LOCAL_DIR', './storage')}/models`),
    /** Côté de l'entrée du réseau (multiple de 14 pour le ViT). */
    inputSize: parseInt(env('DEPTH_ONNX_INPUT_SIZE', '518'), 10),
    /** true si le modèle renvoie une distance (grand = loin) au lieu d'une disparité. */
    invert: env('DEPTH_ONNX_INVERT', 'false') === 'true',
  },
  limits: {
    maxUploadBytes: 12 * 1024 * 1024,
    /** côté long max de l'image source conservée. */
    maxImageDim: 1280,
  },
} as const;
