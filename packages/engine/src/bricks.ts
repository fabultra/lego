import { BRICK_PRIORITY, PLATE_PRIORITY, partDims } from './catalog';
import { gridIndex, type PlacedBrick, type VoxelGrid } from './types';

/**
 * Conversion voxels -> briques : recouvrement exact de chaque couche par des
 * pièces du catalogue, couleur par couleur, via un glouton avec score.
 *
 * Objectifs (dans l'ordre) :
 *  1. couverture exacte (garantie : la 1x1 couvre toujours une cellule) ;
 *  2. imbrication : bonus quand une pièce chevauche PLUSIEURS briques de la
 *     couche inférieure (croise les joints -> murs "appareillés", stables) ;
 *  3. grosses pièces d'abord (moins de pièces, plus rigide) ;
 *  4. orientation préférée alternée par couche (croise les joints même dans
 *     les zones massives où tout est déjà couvert par des 2x4).
 *
 * Déterministe : aucun aléa, l'ordre de scan et les départages sont fixes.
 */

interface LayerAssign {
  /** id global (index dans placements) de la brique couvrant chaque cellule, -1 sinon. */
  ids: Int32Array;
}

export function bricksFromVoxels(grid: VoxelGrid, baseLayers: number): PlacedBrick[] {
  const placements: PlacedBrick[] = [];
  const layerN = grid.sx * grid.sy;
  let below: LayerAssign = { ids: new Int32Array(layerN).fill(-1) };

  for (let z = 0; z < grid.sz; z++) {
    const isBase = z < baseLayers;
    const partList = isBase ? PLATE_PRIORITY : BRICK_PRIORITY;
    const current: LayerAssign = { ids: new Int32Array(layerN).fill(-1) };
    const preferRotated = z % 2 === 1; // alterne l'axe long une couche sur deux

    // Ordre de scan alterné lui aussi (varie la position des joints).
    const cells: number[] = [];
    if (z % 2 === 0) {
      for (let y = 0; y < grid.sy; y++) for (let x = 0; x < grid.sx; x++) cells.push(y * grid.sx + x);
    } else {
      for (let x = 0; x < grid.sx; x++) for (let y = 0; y < grid.sy; y++) cells.push(y * grid.sx + x);
    }

    for (const li of cells) {
      const x0 = li % grid.sx;
      const y0 = (li / grid.sx) | 0;
      const color = grid.data[gridIndex(grid, x0, y0, z)];
      if (color < 0 || current.ids[li] !== -1) continue;

      let bestPart = '';
      let bestRot = false;
      let bestScore = -1;

      for (const partId of partList) {
        for (const rotated of preferRotated ? [true, false] : [false, true]) {
          const { w, d } = partDims(partId, rotated);
          if (x0 + w > grid.sx || y0 + d > grid.sy) continue;
          // Toutes les cellules : remplies, même couleur, non assignées.
          let fits = true;
          for (let dy = 0; dy < d && fits; dy++) {
            for (let dx = 0; dx < w && fits; dx++) {
              const cli = (y0 + dy) * grid.sx + (x0 + dx);
              if (current.ids[cli] !== -1) fits = false;
              else if (grid.data[gridIndex(grid, x0 + dx, y0 + dy, z)] !== color) fits = false;
            }
          }
          if (!fits) continue;

          // Imbrication : briques distinctes de la couche du dessous.
          let interlock = 0;
          if (z > 0) {
            const seen = new Set<number>();
            for (let dy = 0; dy < d; dy++) {
              for (let dx = 0; dx < w; dx++) {
                const id = below.ids[(y0 + dy) * grid.sx + (x0 + dx)];
                if (id >= 0) seen.add(id);
              }
            }
            interlock = Math.min(4, seen.size);
          }

          const area = w * d;
          const score =
            area * 100 +
            interlock * 40 +
            (rotated === preferRotated ? 10 : 0) +
            // micro-départage : pièce la plus longue dans l'axe préféré
            (rotated ? d : w);
          if (score > bestScore) {
            bestScore = score;
            bestPart = partId;
            bestRot = rotated;
          }
        }
      }

      // bestPart est garanti non vide : 1x1 (ou plaque 1x1) passe toujours.
      const { w, d } = partDims(bestPart, bestRot);
      const id = placements.length;
      placements.push({
        id: `b${id}`,
        partId: bestPart,
        colorIndex: color,
        x: x0,
        y: y0,
        z,
        rotated: bestRot,
        stepIndex: 0,
      });
      for (let dy = 0; dy < d; dy++) {
        for (let dx = 0; dx < w; dx++) {
          current.ids[(y0 + dy) * grid.sx + (x0 + dx)] = id;
        }
      }
    }
    below = current;
  }
  return placements;
}
