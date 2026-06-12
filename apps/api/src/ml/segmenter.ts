import { SimpleSegmenter, type RasterImage, type SegmentationResult } from '@brickify/engine';
import sharp from 'sharp';
import { config } from '../config';
import { fetchOutputBuffer, runReplicate } from './replicate';

/**
 * Segmentation "intelligente" : détourage ML via Replicate (BiRefNet) quand un
 * token est configuré, avec REPLI AUTOMATIQUE sur l'heuristique du moteur si
 * l'API échoue (pas de facturation, réseau, timeout, masque aberrant…).
 * L'app ne casse jamais à cause d'un service externe.
 */

export type SegmenterEngine = 'replicate' | 'heuristic';

export interface SmartSegmentation extends SegmentationResult {
  engine: SegmenterEngine;
}

/** Garde-fous : un masque quasi vide ou quasi plein est considéré raté. */
const MIN_COVERAGE = 0.004;
const MAX_COVERAGE = 0.97;

export async function segmentSmart(
  raster: RasterImage,
  normalizedJpeg: Buffer,
): Promise<SmartSegmentation> {
  if (config.replicate.token) {
    try {
      const dataUri = `data:image/jpeg;base64,${normalizedJpeg.toString('base64')}`;
      const output = await runReplicate(config.replicate.segmentModel, { image: dataUri });
      const cutout = await fetchOutputBuffer(output);

      // Le modèle renvoie un PNG détouré (alpha = objet), parfois à une autre
      // résolution : on le réaligne sur l'image source.
      const { data } = await sharp(cutout)
        .ensureAlpha()
        .resize(raster.width, raster.height, { fit: 'fill' })
        .raw()
        .toBuffer({ resolveWithObject: true });

      const mask = new Uint8Array(raster.width * raster.height);
      let count = 0;
      for (let i = 0; i < mask.length; i++) {
        if (data[i * 4 + 3] > 127) {
          mask[i] = 1;
          count++;
        }
      }
      const coverage = count / mask.length;
      if (coverage < MIN_COVERAGE || coverage > MAX_COVERAGE) {
        throw new Error(`masque ML aberrant (couverture ${(coverage * 100).toFixed(1)}%)`);
      }
      return {
        mask: { width: raster.width, height: raster.height, data: mask },
        coverage,
        engine: 'replicate',
      };
    } catch (e) {
      console.warn(
        '[ml] segmentation Replicate indisponible, repli heuristique :',
        e instanceof Error ? e.message : e,
      );
    }
  }
  const seg = await new SimpleSegmenter().segment(raster);
  return { ...seg, engine: 'heuristic' };
}
