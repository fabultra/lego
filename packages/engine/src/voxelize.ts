import { nearestLegoColorIndex } from './palette';
import { gridIndex, type DepthMap, type Silhouette, type VoxelGrid } from './types';

/**
 * Convertit silhouette + carte de profondeur en grille de voxels colorés.
 * L'extrusion est centrée sur le plan médian (y), ce qui donne un volume
 * symétrique avant/arrière — raisonnable sans information de profondeur réelle.
 *
 * La couleur de chaque colonne (x,z) est celle de la cellule de silhouette,
 * mappée immédiatement sur la couleur LEGO la plus proche (palette complète) ;
 * la réduction du nombre de couleurs se fait ensuite dans colors.ts.
 */
export function voxelize(
  s: Silhouette,
  depthMap: DepthMap,
  saturationBoost = 1,
): VoxelGrid {
  let sy = 1;
  for (let i = 0; i < depthMap.depth.length; i++) {
    if (depthMap.depth[i] > sy) sy = depthMap.depth[i];
  }
  const grid: VoxelGrid = {
    sx: s.sx,
    sy,
    sz: s.sz,
    data: new Int16Array(s.sx * sy * s.sz).fill(-1),
  };

  for (let z = 0; z < s.sz; z++) {
    for (let x = 0; x < s.sx; x++) {
      const ci = z * s.sx + x;
      const d = depthMap.depth[ci];
      if (!s.occupancy[ci] || d <= 0) continue;

      let r = s.colors[ci * 3];
      let g = s.colors[ci * 3 + 1];
      let b = s.colors[ci * 3 + 2];
      if (saturationBoost !== 1) {
        const avg = (r + g + b) / 3;
        r = Math.max(0, Math.min(255, avg + (r - avg) * saturationBoost));
        g = Math.max(0, Math.min(255, avg + (g - avg) * saturationBoost));
        b = Math.max(0, Math.min(255, avg + (b - avg) * saturationBoost));
      }
      const colorIndex = nearestLegoColorIndex(r, g, b);

      const yStart = Math.floor((sy - d) / 2);
      for (let y = yStart; y < yStart + d; y++) {
        grid.data[gridIndex(grid, x, y, z)] = colorIndex;
      }
    }
  }
  return grid;
}
