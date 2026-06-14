import type { GrayImage } from '@brickify/engine';
import sharp from 'sharp';
import { config } from '../config';
import { getDepthImageLocal } from './depthOnnx';
import { fetchOutputBuffer, runReplicate } from './replicate';

/**
 * Profondeur monoculaire pour le relief volumique. Stratégie en cascade,
 * jamais bloquante (un échec retombe sur le profil elliptique du moteur) :
 *
 *   1. LOCALE  — Depth Anything V2 ONNX dans le worker (par défaut). Relief
 *      réel sur 100% des générations, zéro cold start, zéro coût par photo.
 *   2. Replicate — Depth Anything v2 hébergé, si un token est configuré.
 *      Repli historique : utile sans le modèle local, mais sujet aux cold
 *      starts GPU.
 *   3. null — aucun relief mesuré : le moteur utilise son profil elliptique.
 */
export async function getDepthImage(
  normalizedJpeg: Buffer,
  width: number,
  height: number,
): Promise<GrayImage | null> {
  if (config.depth.localEnabled) {
    const local = await getDepthImageLocal(normalizedJpeg, width, height);
    if (local) return local;
  }
  if (config.replicate.token) {
    return getDepthImageReplicate(normalizedJpeg, width, height);
  }
  return null;
}

/**
 * Profondeur via Replicate (Depth Anything v2) : carte de gris alignée sur
 * l'image source (255 = proche caméra), ou null si l'API est indisponible.
 */
export async function getDepthImageReplicate(
  normalizedJpeg: Buffer,
  width: number,
  height: number,
): Promise<GrayImage | null> {
  if (!config.replicate.token) return null;
  try {
    const output = await runReplicate(
      config.replicate.depthModel,
      { image: `data:image/jpeg;base64,${normalizedJpeg.toString('base64')}` },
      config.replicate.depthTimeoutMs,
    );
    // Le modèle renvoie soit une URL directe, soit un objet
    // { grey_depth, color_depth } : on préfère la version grise.
    const picked =
      typeof output === 'object' && output !== null && !Array.isArray(output)
        ? ((output as Record<string, unknown>).grey_depth ??
          (output as Record<string, unknown>).greyscale_depth ??
          Object.values(output)[0])
        : output;
    const buf = await fetchOutputBuffer(picked);
    const { data, info } = await sharp(buf)
      .greyscale()
      .resize(width, height, { fit: 'fill' })
      .raw()
      .toBuffer({ resolveWithObject: true });
    const gray = new Uint8Array(width * height);
    for (let i = 0; i < gray.length; i++) gray[i] = data[i * info.channels];
    console.log('[ml] relief Replicate appliqué (depth-anything-v2)');
    return { width, height, data: gray };
  } catch (e) {
    console.warn('[ml] profondeur Replicate indisponible, profil elliptique :', e instanceof Error ? e.message : e);
    return null;
  }
}
