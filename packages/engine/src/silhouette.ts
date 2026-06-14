import { BRICK_HEIGHT_RATIO, type GrayImage, type Mask, type RasterImage, type Silhouette } from './types';

/** Boîte englobante du masque, avec une petite marge. */
export function maskBounds(mask: Mask): { x0: number; y0: number; x1: number; y1: number } | null {
  let x0 = mask.width;
  let y0 = mask.height;
  let x1 = -1;
  let y1 = -1;
  for (let y = 0; y < mask.height; y++) {
    for (let x = 0; x < mask.width; x++) {
      if (mask.data[y * mask.width + x]) {
        if (x < x0) x0 = x;
        if (x > x1) x1 = x;
        if (y < y0) y0 = y;
        if (y > y1) y1 = y;
      }
    }
  }
  if (x1 < 0) return null;
  return { x0, y0, x1, y1 };
}

/**
 * Échantillonne le masque + l'image sur la grille LEGO (plan x/z).
 *
 * - `targetStudsWidth` : largeur du modèle en tenons.
 * - Les cellules sont rectangulaires : 1 tenon de large (8mm) pour
 *   1 hauteur de brique (9.6mm) -> hauteur cellule = largeur * 1.2.
 * - Une cellule est occupée si la couverture du masque >= coverageThreshold.
 * - z est inversé par rapport à py (z=0 en bas du modèle).
 */
export function buildSilhouette(
  image: RasterImage,
  mask: Mask,
  targetStudsWidth: number,
  coverageThreshold: number,
  /** Carte de profondeur alignée sur l'image (255 = proche), optionnelle. */
  depthImage?: GrayImage,
): Silhouette | null {
  if (image.width !== mask.width || image.height !== mask.height) {
    throw new Error('image et masque doivent avoir les mêmes dimensions');
  }
  const bounds = maskBounds(mask);
  if (!bounds) return null;

  const bw = bounds.x1 - bounds.x0 + 1;
  const bh = bounds.y1 - bounds.y0 + 1;

  const cellPx = bw / targetStudsWidth; // px par tenon
  const cellPxV = cellPx * BRICK_HEIGHT_RATIO; // px par couche de brique
  const sx = targetStudsWidth;
  const sz = Math.max(1, Math.round(bh / cellPxV));

  const occupancy = new Uint8Array(sx * sz);
  const colors = new Uint8ClampedArray(sx * sz * 3);
  const depth = depthImage ? new Float32Array(sx * sz) : undefined;
  if (depthImage && (depthImage.width !== image.width || depthImage.height !== image.height)) {
    throw new Error('carte de profondeur et image doivent avoir les mêmes dimensions');
  }

  for (let cz = 0; cz < sz; cz++) {
    // z=0 -> bas de la boîte englobante
    const pyStart = bounds.y0 + (sz - 1 - cz) * cellPxV;
    const pyEnd = bounds.y0 + (sz - cz) * cellPxV;
    for (let cx = 0; cx < sx; cx++) {
      const pxStart = bounds.x0 + cx * cellPx;
      const pxEnd = bounds.x0 + (cx + 1) * cellPx;

      let inside = 0;
      let total = 0;
      let r = 0;
      let g = 0;
      let b = 0;
      let dSum = 0;
      const yA = Math.max(0, Math.floor(pyStart));
      const yB = Math.min(image.height - 1, Math.ceil(pyEnd) - 1);
      const xA = Math.max(0, Math.floor(pxStart));
      const xB = Math.min(image.width - 1, Math.ceil(pxEnd) - 1);
      for (let py = yA; py <= yB; py++) {
        for (let px = xA; px <= xB; px++) {
          total++;
          const mi = py * mask.width + px;
          if (mask.data[mi]) {
            inside++;
            const ii = mi * 4;
            r += image.data[ii];
            g += image.data[ii + 1];
            b += image.data[ii + 2];
            if (depthImage) dSum += depthImage.data[mi];
          }
        }
      }
      const ci = cz * sx + cx;
      if (total > 0 && inside / total >= coverageThreshold && inside > 0) {
        occupancy[ci] = 1;
        colors[ci * 3] = Math.round(r / inside);
        colors[ci * 3 + 1] = Math.round(g / inside);
        colors[ci * 3 + 2] = Math.round(b / inside);
        if (depth) depth[ci] = dSum / inside;
      }
    }
  }

  return { sx, sz, occupancy, colors, depth };
}

/**
 * Nettoyage 2D de la silhouette : comble les trous d'une cellule et retire
 * les cellules isolées (anti-aliasing de la voxelisation).
 */
export function tidySilhouette(s: Silhouette, iterations: number): Silhouette {
  const { sx, sz } = s;
  let occ = s.occupancy;
  for (let it = 0; it < iterations; it++) {
    const next = new Uint8Array(occ);
    for (let z = 0; z < sz; z++) {
      for (let x = 0; x < sx; x++) {
        const i = z * sx + x;
        let n = 0;
        if (x > 0 && occ[i - 1]) n++;
        if (x < sx - 1 && occ[i + 1]) n++;
        if (z > 0 && occ[i - sx]) n++;
        if (z < sz - 1 && occ[i + sx]) n++;
        if (!occ[i] && n >= 3) next[i] = 1; // trou
        if (occ[i] && n === 0) next[i] = 0; // cellule isolée
      }
    }
    occ = next;
  }
  // Couleur (et profondeur) des cellules comblées : moyenne des voisines
  // occupées d'origine.
  const colors = new Uint8ClampedArray(s.colors);
  const depth = s.depth ? new Float32Array(s.depth) : undefined;
  for (let z = 0; z < sz; z++) {
    for (let x = 0; x < sx; x++) {
      const i = z * sx + x;
      if (occ[i] && !s.occupancy[i]) {
        let r = 0;
        let g = 0;
        let b = 0;
        let d = 0;
        let n = 0;
        const take = (j: number) => {
          if (s.occupancy[j]) {
            r += s.colors[j * 3];
            g += s.colors[j * 3 + 1];
            b += s.colors[j * 3 + 2];
            if (s.depth) d += s.depth[j];
            n++;
          }
        };
        if (x > 0) take(i - 1);
        if (x < sx - 1) take(i + 1);
        if (z > 0) take(i - sx);
        if (z < sz - 1) take(i + sx);
        if (n > 0) {
          colors[i * 3] = Math.round(r / n);
          colors[i * 3 + 1] = Math.round(g / n);
          colors[i * 3 + 2] = Math.round(b / n);
          if (depth) depth[i] = d / n;
        }
      }
    }
  }
  return { sx, sz, occupancy: occ, colors, depth };
}
