import { buildBom } from './bom';
import { bricksFromVoxels } from './bricks';
import { PARTS } from './catalog';
import { ensureColorInPalette, reduceToModelPalette } from './colors';
import { estimateDepth } from './depth';
import { generateInstructions } from './instructions';
import { BASE_COLOR_INDEX } from './palette';
import { resizeRaster, SimpleSegmenter, type SegmentationResult } from './segmentation';
import { buildSilhouette, tidySilhouette } from './silhouette';
import { simplifyGrid } from './simplify';
import { validateStructure } from './stability';
import {
  gridIndex,
  type LegoPart,
  type Mask,
  type PipelineOptions,
  type PipelineResult,
  type ProgressCallback,
  type RasterImage,
  type ResolvedParams,
} from './types';
import { voxelize } from './voxelize';
import { partDims } from './catalog';

/** Résolution de travail : la photo est réduite avant segmentation. */
const WORKING_MAX_DIM = 384;
/** Garde-fou : hauteur max du modèle (l'objet le plus haut reste imprimable en instructions). */
const MAX_LAYERS = 66;
/** Couverture minimale du masque pour considérer qu'un objet a été détecté. */
const MIN_MASK_COVERAGE = 0.004;

const SIZE_TO_STUDS = { small: 16, medium: 28, large: 44 } as const;

export class EngineError extends Error {
  constructor(
    public readonly code: 'OBJECT_NOT_FOUND' | 'EMPTY_SILHOUETTE',
    message: string,
  ) {
    super(message);
    this.name = 'EngineError';
  }
}

export function resolveParams(o: PipelineOptions): ResolvedParams {
  const targetStudsWidth = SIZE_TO_STUDS[o.size];
  let maxColors = { simple: 4, balanced: 8, detailed: 14 }[o.detail];
  const coverageThreshold = { simple: 0.55, balanced: 0.5, detailed: 0.42 }[o.detail];
  const minIslandVoxels = { simple: 8, balanced: 5, detailed: 3 }[o.detail];
  let smoothIterations = { simple: 2, balanced: 1, detailed: 1 }[o.detail];

  let depthMode: ResolvedParams['depthMode'] = 'rounded';
  let maxDepthStuds = Math.max(2, Math.round(targetStudsWidth * 0.5));
  let depthQuantizeStep = 1;
  let saturationBoost = 1;

  switch (o.style) {
    case 'realistic':
      break;
    case 'cartoon':
      maxColors = Math.min(maxColors, 6);
      saturationBoost = 1.35;
      smoothIterations += 1;
      break;
    case 'pixel_art':
      depthMode = 'flat';
      maxDepthStuds = Math.max(2, Math.round(targetStudsWidth * 0.12));
      break;
    case 'blocky':
      depthQuantizeStep = 2;
      maxColors = Math.min(maxColors, 5);
      smoothIterations += 1;
      break;
  }
  if (o.depthStuds) {
    maxDepthStuds = Math.max(1, Math.min(targetStudsWidth, Math.round(o.depthStuds)));
  }

  return {
    targetStudsWidth,
    maxColors,
    depthMode,
    maxDepthStuds,
    depthQuantizeStep,
    saturationBoost,
    coverageThreshold,
    minIslandVoxels,
    smoothIterations,
    allowSlopes: o.detail === 'detailed', // V2
  };
}

/**
 * Pipeline complet : photo -> modèle LEGO constructible + instructions.
 * Pur et déterministe (aucun aléa, aucune I/O) — exécutable dans un worker
 * BullMQ côté serveur comme dans un test unitaire.
 */
export async function runPipeline(
  image: RasterImage,
  options: PipelineOptions,
  onProgress?: ProgressCallback,
): Promise<PipelineResult> {
  const report = (stage: string, pct: number) => onProgress?.(stage, pct);
  const params = resolveParams(options);

  // --- 1. Segmentation -----------------------------------------------------
  report('segmentation', 5);
  const workImg = resizeRaster(image, WORKING_MAX_DIM);
  let seg: SegmentationResult;
  if (options.precomputedMask) {
    seg = {
      mask: resizeMask(options.precomputedMask, workImg.width, workImg.height),
      coverage: maskCoverage(options.precomputedMask),
    };
  } else {
    seg = await new SimpleSegmenter(WORKING_MAX_DIM).segment(workImg);
  }
  if (seg.coverage < MIN_MASK_COVERAGE) {
    throw new EngineError(
      'OBJECT_NOT_FOUND',
      "Aucun objet n'a été détecté — reprendre la photo sur fond uni et contrasté.",
    );
  }

  // --- 2. Silhouette sur la grille LEGO ------------------------------------
  report('silhouette', 18);
  let silhouette = buildSilhouette(workImg, seg.mask, params.targetStudsWidth, params.coverageThreshold);
  if (!silhouette) throw new EngineError('EMPTY_SILHOUETTE', 'Silhouette vide après échantillonnage.');
  if (silhouette.sz > MAX_LAYERS) {
    const reducedWidth = Math.max(6, Math.floor((params.targetStudsWidth * MAX_LAYERS) / silhouette.sz));
    silhouette = buildSilhouette(workImg, seg.mask, reducedWidth, params.coverageThreshold);
    if (!silhouette) throw new EngineError('EMPTY_SILHOUETTE', 'Silhouette vide après échantillonnage.');
  }
  silhouette = tidySilhouette(silhouette, params.smoothIterations);

  // --- 3. Profondeur (extrusion MVP, voir docs/PIPELINE.md) ----------------
  report('depth', 28);
  const depthMap = estimateDepth(silhouette, params.depthMode, params.maxDepthStuds, params.depthQuantizeStep);

  // --- 4. Voxelisation ------------------------------------------------------
  report('voxelize', 38);
  const rawGrid = voxelize(silhouette, depthMap, params.saturationBoost);

  // --- 5. Couleurs LEGO ------------------------------------------------------
  report('colors', 48);
  const { palette } = reduceToModelPalette(rawGrid, params.maxColors);

  // --- 6. Simplification / constructibilité --------------------------------
  report('simplify', 58);
  const simplified = simplifyGrid(rawGrid, {
    minIslandVoxels: params.minIslandVoxels,
    addBase: options.addBase ?? 'auto',
    baseColorIndex: () => ensureColorInPalette(palette, BASE_COLOR_INDEX),
  });
  const grid = simplified.grid;

  // --- 7 & 8. Briques + boucle de constructibilité --------------------------
  // Fusion -> validation -> les briques sans appui vertical sont retirées
  // (leurs voxels avec) -> re-fusion. Retirer une brique peut en décrocher
  // d'autres, d'où la boucle ; elle converge car le volume décroît strictement.
  report('bricks', 72);
  let placed = bricksFromVoxels(grid, simplified.baseLayers);
  report('stability', 84);
  let stability = validateStructure(placed);
  let carvedFloatingBricks = 0;
  let guard = 0;
  while (stability.dropped.length > 0 && guard++ < 100) {
    carvedFloatingBricks += stability.dropped.length;
    for (const b of stability.dropped) clearBrickVoxels(grid, b);
    placed = bricksFromVoxels(grid, simplified.baseLayers);
    stability = validateStructure(placed);
  }

  const issues = [...simplified.issues, ...stability.issues];
  let stabilityScore = stability.score;
  if (carvedFloatingBricks > 0) {
    issues.push({
      kind: 'floating',
      message:
        `${carvedFloatingBricks} brique(s) en surplomb irréalisable retirée(s) : ` +
        'la forme a été légèrement creusée pour rester constructible.',
    });
    stabilityScore = Math.max(0, stabilityScore - Math.min(0.2, carvedFloatingBricks * 0.004));
  }

  // --- 9. Instructions + nomenclature ---------------------------------------
  report('instructions', 92);
  const steps = generateInstructions(stability.bricks, simplified.baseLayers);
  const bom = buildBom(stability.bricks);

  let voxelCount = 0;
  for (let i = 0; i < grid.data.length; i++) if (grid.data[i] >= 0) voxelCount++;

  const usedPartIds = [...new Set(stability.bricks.map((b) => b.partId))].sort();
  const parts: LegoPart[] = usedPartIds.map((id) => PARTS[id]);

  report('persist', 100);
  return {
    sizeX: grid.sx,
    sizeY: grid.sy,
    sizeZ: grid.sz,
    palette,
    parts,
    bricks: stability.bricks,
    steps,
    bom,
    issues,
    stabilityScore,
    stats: {
      voxelCount,
      removedUnsupportedVoxels: simplified.removedUnsupported,
      filledHoles: simplified.filledHoles,
      removedIslands: simplified.removedIslands,
      carvedFloatingBricks,
    },
    mask: seg.mask,
    grid,
  };
}

function clearBrickVoxels(grid: { sx: number; sy: number; data: Int16Array }, b: { partId: string; rotated: boolean; x: number; y: number; z: number }): void {
  const { w, d } = partDims(b.partId, b.rotated);
  for (let dy = 0; dy < d; dy++) {
    for (let dx = 0; dx < w; dx++) {
      grid.data[gridIndex(grid, b.x + dx, b.y + dy, b.z)] = -1;
    }
  }
}

function maskCoverage(mask: Mask): number {
  let n = 0;
  for (let i = 0; i < mask.data.length; i++) n += mask.data[i];
  return n / (mask.width * mask.height);
}

function resizeMask(mask: Mask, w: number, h: number): Mask {
  if (mask.width === w && mask.height === h) return mask;
  const out = new Uint8Array(w * h);
  for (let y = 0; y < h; y++) {
    const sy = Math.min(mask.height - 1, Math.floor((y / h) * mask.height));
    for (let x = 0; x < w; x++) {
      const sx = Math.min(mask.width - 1, Math.floor((x / w) * mask.width));
      out[y * w + x] = mask.data[sy * mask.width + sx];
    }
  }
  return { width: w, height: h, data: out };
}
