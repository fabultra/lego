import type { LegoColor } from './types';

/**
 * Palette LEGO réduite : couleurs opaques courantes, faciles à sourcer.
 *
 * `id` = id Rebrickable (canonique, égal au code LDraw pour ces couleurs
 * standards — vérifié contre colors.csv de Rebrickable, hex inclus).
 * `blId` = id couleur BrickLink (export Wanted List).
 * Le job d'import Rebrickable (apps/api) audite automatiquement noms et hex
 * contre le catalogue officiel à chaque import.
 */
function c(id: number, blId: number, name: string, hex: string): LegoColor {
  const rgb: [number, number, number] = [
    parseInt(hex.slice(1, 3), 16),
    parseInt(hex.slice(3, 5), 16),
    parseInt(hex.slice(5, 7), 16),
  ];
  return { id, blId, name, hex, rgb };
}

export const LEGO_PALETTE: LegoColor[] = [
  c(15, 1, 'White', '#F4F4F4'),
  c(71, 86, 'Light Bluish Gray', '#A0A5A9'),
  c(72, 85, 'Dark Bluish Gray', '#6C6E68'),
  c(0, 11, 'Black', '#1B2A34'),
  c(4, 5, 'Red', '#C91A09'),
  c(320, 59, 'Dark Red', '#720E0F'),
  c(25, 4, 'Orange', '#FE8A18'),
  c(191, 110, 'Bright Light Orange', '#F8BB3D'),
  c(14, 3, 'Yellow', '#F2CD37'),
  c(226, 103, 'Bright Light Yellow', '#FFF03A'),
  c(27, 34, 'Lime', '#BBE90B'),
  c(10, 36, 'Bright Green', '#4B9F4A'),
  c(2, 6, 'Green', '#237841'),
  c(288, 80, 'Dark Green', '#184632'),
  c(322, 156, 'Medium Azure', '#36AEBF'),
  c(73, 42, 'Medium Blue', '#5A93DB'),
  c(1, 7, 'Blue', '#0055BF'),
  c(272, 63, 'Dark Blue', '#0A3463'),
  c(22, 24, 'Purple', '#81007B'),
  c(5, 47, 'Dark Pink', '#C870A0'),
  c(29, 104, 'Bright Pink', '#E4ADC8'),
  c(19, 2, 'Tan', '#E4CD9E'),
  c(28, 69, 'Dark Tan', '#958A73'),
  c(70, 88, 'Reddish Brown', '#582A12'),
  c(308, 120, 'Dark Brown', '#352100'),
];

// ---------------------------------------------------------------------------
// Conversion sRGB -> CIELAB pour une distance perceptuelle correcte.
// (La distance RGB brute mappe mal les bruns/oranges/jaunes LEGO.)
// ---------------------------------------------------------------------------

function srgbToLinear(v: number): number {
  const s = v / 255;
  return s <= 0.04045 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
}

export function rgbToLab(r: number, g: number, b: number): [number, number, number] {
  const rl = srgbToLinear(r);
  const gl = srgbToLinear(g);
  const bl = srgbToLinear(b);
  // sRGB D65
  let x = rl * 0.4124564 + gl * 0.3575761 + bl * 0.1804375;
  let y = rl * 0.2126729 + gl * 0.7151522 + bl * 0.072175;
  let z = rl * 0.0193339 + gl * 0.119192 + bl * 0.9503041;
  x /= 0.95047;
  z /= 1.08883;
  const f = (t: number) => (t > 0.008856 ? Math.cbrt(t) : 7.787 * t + 16 / 116);
  const fx = f(x);
  const fy = f(y);
  const fz = f(z);
  return [116 * fy - 16, 500 * (fx - fy), 200 * (fy - fz)];
}

const PALETTE_LAB: [number, number, number][] = LEGO_PALETTE.map((col) =>
  rgbToLab(col.rgb[0], col.rgb[1], col.rgb[2]),
);

export function labDistanceSq(a: [number, number, number], b: [number, number, number]): number {
  const dl = a[0] - b[0];
  const da = a[1] - b[1];
  const db = a[2] - b[2];
  return dl * dl + da * da + db * db;
}

/** Index (dans LEGO_PALETTE) de la couleur LEGO la plus proche d'un RGB. */
export function nearestLegoColorIndex(r: number, g: number, b: number): number {
  const lab = rgbToLab(r, g, b);
  let best = 0;
  let bestD = Infinity;
  for (let i = 0; i < PALETTE_LAB.length; i++) {
    const d = labDistanceSq(lab, PALETTE_LAB[i]);
    if (d < bestD) {
      bestD = d;
      best = i;
    }
  }
  return best;
}

/** Couleur neutre utilisée pour la base ajoutée automatiquement. */
export const BASE_COLOR_INDEX = LEGO_PALETTE.findIndex((p) => p.name === 'Light Bluish Gray');
