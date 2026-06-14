/**
 * @brickify/engine — pipeline photo -> modèle LEGO.
 *
 * Point d'entrée principal : `runPipeline(image, options, onProgress)`.
 * Tout est pur TypeScript, déterministe, sans dépendance runtime : le
 * décodage des images (JPEG/PNG -> RasterImage) est la responsabilité de
 * l'appelant (l'API utilise sharp).
 */

export * from './types';
export { LEGO_PALETTE, nearestLegoColorIndex, rgbToLab, BASE_COLOR_INDEX } from './palette';
export { PARTS, BRICK_PRIORITY, PLATE_PRIORITY, partDims } from './catalog';
export {
  SimpleSegmenter,
  resizeRaster,
  type Segmenter,
  type SegmentationResult,
} from './segmentation';
export { buildSilhouette, tidySilhouette, maskBounds } from './silhouette';
export { estimateDepth, distanceTransform } from './depth';
export { voxelize } from './voxelize';
export {
  simplifyGrid,
  removeSmallIslands,
  fillInternalHoles,
  enforceSupport,
  addBaseLayer,
  type SimplifyOptions,
  type SimplifyResult,
} from './simplify';
export { reduceToModelPalette, ensureColorInPalette } from './colors';
export { bricksFromVoxels } from './bricks';
export { validateStructure, type StabilityResult } from './stability';
export { generateInstructions } from './instructions';
export { buildBom, bomTotalCents, PRICE_DISCLAIMER } from './bom';
export { runPipeline, resolveParams, EngineError } from './pipeline';
// Fixtures de dev/test (images synthétiques, aucun décodeur requis) :
export { makeMushroomImage, makeCarpetMugImage } from './demo/sampleImage';
