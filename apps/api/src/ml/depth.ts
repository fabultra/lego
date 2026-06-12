import type { GrayImage } from '@brickify/engine';
import sharp from 'sharp';
import { config } from '../config';
import { fetchOutputBuffer, runReplicate } from './replicate';

/**
 * Profondeur monoculaire via Replicate (Depth Anything v2) : retourne une
 * carte de gris alignée sur l'image source (255 = proche caméra), ou null si
 * l'API est indisponible — le pipeline retombe alors sur son profil
 * elliptique. Ne jamais bloquer une génération pour du relief.
 */
export async function getDepthImage(
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
    return { width, height, data: gray };
  } catch (e) {
    console.warn('[ml] profondeur Replicate indisponible, profil elliptique :', e instanceof Error ? e.message : e);
    return null;
  }
}
