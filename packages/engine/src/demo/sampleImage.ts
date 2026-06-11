import type { RasterImage } from '../types';

/**
 * Image de test procédurale : un champignon rouge à pois blancs sur fond
 * clair légèrement bruité — multi-couleurs, forme organique, fond réaliste.
 * Permet de tester tout le pipeline sans décodeur JPEG/PNG.
 */
export function makeMushroomImage(width = 240, height = 300): RasterImage {
  const data = new Uint8ClampedArray(width * height * 4);

  // Bruit pseudo-aléatoire déterministe (mulberry32).
  let seed = 1337;
  const rand = () => {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };

  const set = (x: number, y: number, r: number, g: number, b: number) => {
    if (x < 0 || y < 0 || x >= width || y >= height) return;
    const i = (y * width + x) * 4;
    const n = (rand() - 0.5) * 10;
    data[i] = Math.max(0, Math.min(255, r + n));
    data[i + 1] = Math.max(0, Math.min(255, g + n));
    data[i + 2] = Math.max(0, Math.min(255, b + n));
    data[i + 3] = 255;
  };

  // Fond : dégradé clair.
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const v = 232 + (y / height) * 16;
      set(x, y, v, v, v + 4);
    }
  }

  const cx = width / 2;
  const capCy = height * 0.42;
  const capR = width * 0.38;

  // Pied (tan), légèrement évasé en bas.
  const stemTop = capCy + capR * 0.1;
  const stemBottom = height * 0.88;
  for (let y = Math.round(stemTop); y < stemBottom; y++) {
    const t = (y - stemTop) / (stemBottom - stemTop);
    const half = width * (0.11 + 0.05 * t * t);
    for (let x = Math.round(cx - half); x <= cx + half; x++) {
      set(x, y, 228, 205, 158);
    }
  }

  // Chapeau : demi-disque rouge (ellipse aplatie).
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const dx = (x - cx) / capR;
      const dy = (y - capCy) / (capR * 0.78);
      if (dx * dx + dy * dy <= 1 && y <= capCy + capR * 0.18) {
        set(x, y, 201, 26, 9);
      }
    }
  }

  // Pois blancs sur le chapeau.
  const spots: [number, number, number][] = [
    [cx - capR * 0.45, capCy - capR * 0.25, capR * 0.13],
    [cx + capR * 0.35, capCy - capR * 0.38, capR * 0.11],
    [cx - capR * 0.02, capCy - capR * 0.62, capR * 0.1],
    [cx + capR * 0.52, capCy - capR * 0.02, capR * 0.09],
    [cx - capR * 0.6, capCy - capR * 0.02, capR * 0.08],
  ];
  for (const [sx, sy, sr] of spots) {
    for (let y = Math.round(sy - sr); y <= sy + sr; y++) {
      for (let x = Math.round(sx - sr); x <= sx + sr; x++) {
        const dx = x - sx;
        const dy = y - sy;
        if (dx * dx + dy * dy <= sr * sr) set(x, y, 244, 244, 244);
      }
    }
  }

  return { width, height, data };
}
