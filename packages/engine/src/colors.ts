import { LEGO_PALETTE, labDistanceSq, rgbToLab } from './palette';
import type { LegoColor, VoxelGrid } from './types';

/**
 * Réduction de palette : la grille arrive avec des index dans la palette LEGO
 * complète ; on garde les `maxColors` couleurs les plus représentées et on
 * remappe les autres vers la couleur conservée la plus proche (CIELAB).
 * La grille est remappée EN PLACE vers des index 0..k-1 dans la palette
 * retournée (ordre : fréquence décroissante -> rendu déterministe).
 */
export function reduceToModelPalette(
  grid: VoxelGrid,
  maxColors: number,
): { palette: LegoColor[]; colorCount: number } {
  const freq = new Map<number, number>();
  for (let i = 0; i < grid.data.length; i++) {
    const v = grid.data[i];
    if (v >= 0) freq.set(v, (freq.get(v) ?? 0) + 1);
  }
  const sorted = [...freq.entries()].sort((a, b) => b[1] - a[1] || a[0] - b[0]);
  const kept = sorted.slice(0, Math.max(1, maxColors)).map(([idx]) => idx);

  const keptLab = kept.map((idx) => {
    const { rgb } = LEGO_PALETTE[idx];
    return rgbToLab(rgb[0], rgb[1], rgb[2]);
  });

  // table de remap : index palette complète -> index palette modèle
  const remap = new Map<number, number>();
  kept.forEach((idx, i) => remap.set(idx, i));
  for (const [idx] of sorted.slice(kept.length)) {
    const { rgb } = LEGO_PALETTE[idx];
    const lab = rgbToLab(rgb[0], rgb[1], rgb[2]);
    let best = 0;
    let bestD = Infinity;
    for (let i = 0; i < keptLab.length; i++) {
      const d = labDistanceSq(lab, keptLab[i]);
      if (d < bestD) {
        bestD = d;
        best = i;
      }
    }
    remap.set(idx, best);
  }

  for (let i = 0; i < grid.data.length; i++) {
    const v = grid.data[i];
    if (v >= 0) grid.data[i] = remap.get(v)!;
  }

  const palette = kept.map((idx) => LEGO_PALETTE[idx]);
  return { palette, colorCount: palette.length };
}

/**
 * Garantit que la couleur de base (index palette complète donné) figure dans
 * la palette modèle ; retourne son index modèle (l'ajoute si nécessaire).
 * Utilisé quand une base est ajoutée après la réduction de palette.
 */
export function ensureColorInPalette(palette: LegoColor[], fullPaletteIndex: number): number {
  const color = LEGO_PALETTE[fullPaletteIndex];
  const existing = palette.findIndex((p) => p.id === color.id);
  if (existing >= 0) return existing;
  palette.push(color);
  return palette.length - 1;
}
