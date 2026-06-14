import { createWriteStream } from 'node:fs';
import { mkdir, rename, stat } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { Readable } from 'node:stream';
import { pipeline as streamPipeline } from 'node:stream/promises';
import type { GrayImage } from '@brickify/engine';
import sharp from 'sharp';
import { config } from '../config';
import { normalizeAndResizeDepth } from './depthPostprocess';

/**
 * Profondeur monoculaire LOCALE dans le worker — Depth Anything V2 (Small),
 * export ONNX (licence Apache-2.0), exécuté sur CPU via onnxruntime-node.
 *
 * Pourquoi : supprime la dépendance Replicate pour le relief (cold starts GPU
 * de plusieurs minutes), donne un relief réel sur 100% des générations, sans
 * coût par photo. Comme partout dans le pipeline, le relief reste un BONUS :
 * toute erreur (poids absents, réseau, runtime) retombe en silence sur le
 * profil elliptique du moteur via un retour `null`.
 *
 * Le modèle (~99 Mo) est téléchargé à la première utilisation puis mis en
 * cache sur le disque (volume /data en prod) — un seul cold start, jamais
 * répété. On peut aussi le pré-embarquer via DEPTH_ONNX_MODEL_PATH.
 */

// Normalisation ImageNet attendue par le pré-processeur Depth Anything.
const MEAN = [0.485, 0.456, 0.406];
const STD = [0.229, 0.224, 0.225];

// onnxruntime-node est une dépendance OPTIONNELLE (binaire natif lourd) et son
// chargement est différé : le boot de l'API ne doit pas en dépendre, et les
// tests purs ne doivent pas le charger.
type OrtModule = typeof import('onnxruntime-node');
type OrtSession = import('onnxruntime-node').InferenceSession;

let ortPromise: Promise<OrtModule | null> | null = null;
async function loadOrt(): Promise<OrtModule | null> {
  if (!ortPromise) {
    ortPromise = import('onnxruntime-node')
      .then((m) => (m.default ?? m) as OrtModule)
      .catch((e) => {
        console.warn(
          '[ml] onnxruntime-node indisponible, relief local désactivé :',
          e instanceof Error ? e.message : e,
        );
        return null;
      });
  }
  return ortPromise;
}

/** Télécharge le modèle vers `dest` (écriture atomique via fichier .part). */
async function downloadModel(url: string, dest: string): Promise<void> {
  await mkdir(dirname(dest), { recursive: true });
  const res = await fetch(url);
  if (!res.ok || !res.body) {
    throw new Error(`téléchargement modèle HTTP ${res.status}`);
  }
  const tmp = `${dest}.part`;
  await streamPipeline(Readable.fromWeb(res.body as Parameters<typeof Readable.fromWeb>[0]), createWriteStream(tmp));
  const { size } = await stat(tmp);
  if (size < 1_000_000) throw new Error(`modèle téléchargé trop petit (${size} octets)`);
  await rename(tmp, dest);
  console.log(`[ml] modèle de profondeur téléchargé (${(size / 1e6).toFixed(0)} Mo) -> ${dest}`);
}

/** Résout le chemin local du modèle (pré-embarqué ou cache), le télécharge si absent. */
async function resolveModelPath(): Promise<string> {
  if (config.depth.onnxModelPath) return config.depth.onnxModelPath;
  const dest = join(config.depth.modelDir, 'depth-anything-v2-small.onnx');
  try {
    await stat(dest);
    return dest;
  } catch {
    await downloadModel(config.depth.onnxModelUrl, dest);
    return dest;
  }
}

// Session unique partagée (Promise pour mutualiser un éventuel chargement
// concurrent). `null` si le runtime ou le modèle est indisponible.
let sessionPromise: Promise<OrtSession | null> | null = null;
async function getSession(): Promise<OrtSession | null> {
  if (!sessionPromise) {
    sessionPromise = (async () => {
      const ort = await loadOrt();
      if (!ort) return null;
      try {
        const modelPath = await resolveModelPath();
        const session = await ort.InferenceSession.create(modelPath, {
          executionProviders: ['cpu'],
          graphOptimizationLevel: 'all',
        });
        console.log('[ml] session de profondeur ONNX prête (depth-anything-v2-small)');
        return session;
      } catch (e) {
        console.warn(
          '[ml] init profondeur ONNX impossible, repli profil elliptique :',
          e instanceof Error ? e.message : e,
        );
        return null;
      }
    })();
  }
  return sessionPromise;
}

/** Prépare l'entrée CHW float32 normalisée ImageNet à la taille du réseau. */
async function preprocess(jpeg: Buffer, size: number): Promise<Float32Array> {
  const { data } = await sharp(jpeg)
    .resize(size, size, { fit: 'fill' })
    .removeAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  const plane = size * size;
  const out = new Float32Array(3 * plane);
  for (let i = 0; i < plane; i++) {
    for (let c = 0; c < 3; c++) {
      out[c * plane + i] = (data[i * 3 + c] / 255 - MEAN[c]) / STD[c];
    }
  }
  return out;
}

/**
 * Carte de profondeur locale alignée sur l'image source (255 = proche), ou
 * `null` si l'inférence locale est indisponible — jamais bloquant.
 */
export async function getDepthImageLocal(
  jpeg: Buffer,
  width: number,
  height: number,
): Promise<GrayImage | null> {
  const ort = await loadOrt();
  const session = await getSession();
  if (!ort || !session) return null;
  try {
    const size = config.depth.inputSize;
    const input = await preprocess(jpeg, size);
    const tensor = new ort.Tensor('float32', input, [1, 3, size, size]);
    const feeds: Record<string, import('onnxruntime-node').Tensor> = {
      [session.inputNames[0]]: tensor,
    };
    const results = await session.run(feeds);
    const out = results[session.outputNames[0]];
    // predicted_depth : [1, H, W] ou [1, 1, H, W] — on récupère H/W de fin.
    const dims = out.dims;
    const srcH = Number(dims[dims.length - 2]);
    const srcW = Number(dims[dims.length - 1]);
    const raw = out.data as Float32Array;
    const gray = normalizeAndResizeDepth(raw, srcW, srcH, width, height, config.depth.invert);
    console.log('[ml] relief local ONNX appliqué (depth-anything-v2-small)');
    return { width: gray.width, height: gray.height, data: gray.data };
  } catch (e) {
    console.warn(
      '[ml] inférence profondeur locale échouée, repli profil elliptique :',
      e instanceof Error ? e.message : e,
    );
    return null;
  }
}
