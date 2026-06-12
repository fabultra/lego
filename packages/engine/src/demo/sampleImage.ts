import type { RasterImage } from '../types';

/**
 * Image de test procédurale : un champignon rouge à pois blancs sur fond
 * clair légèrement bruité — multi-couleurs, forme organique, fond réaliste.
 * Permet de tester tout le pipeline sans décodeur JPEG/PNG.
 */
/**
 * Cas adversarial reproduit d'une vraie photo utilisateur : mug sauge (faible
 * contraste) posé sur un tapis gris fortement texturé. Le segmenteur naïf
 * prenait les taches du tapis pour l'objet. Retourne aussi la vérité terrain.
 */
export function makeCarpetMugImage(
  width = 288,
  height = 384,
): { image: RasterImage; truth: Uint8Array } {
  const data = new Uint8ClampedArray(width * height * 4);
  const truth = new Uint8Array(width * height);

  let seed = 4242;
  const rand = () => {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };

  // Texture du tapis : bruit basse fréquence (nappes claires/sombres) +
  // grain fin par pixel — c'est ce qui piégeait le seuillage.
  const cell = 24;
  const gw = Math.ceil(width / cell) + 1;
  const gh = Math.ceil(height / cell) + 1;
  const lowFreq = new Float32Array(gw * gh);
  for (let i = 0; i < lowFreq.length; i++) lowFreq[i] = (rand() - 0.5) * 2;
  const lowAt = (x: number, y: number) => {
    const gx = x / cell;
    const gy = y / cell;
    const x0 = Math.floor(gx);
    const y0 = Math.floor(gy);
    const fx = gx - x0;
    const fy = gy - y0;
    const v00 = lowFreq[y0 * gw + x0];
    const v10 = lowFreq[y0 * gw + Math.min(gw - 1, x0 + 1)];
    const v01 = lowFreq[Math.min(gh - 1, y0 + 1) * gw + x0];
    const v11 = lowFreq[Math.min(gh - 1, y0 + 1) * gw + Math.min(gw - 1, x0 + 1)];
    return (v00 * (1 - fx) + v10 * fx) * (1 - fy) + (v01 * (1 - fx) + v11 * fx) * fy;
  };

  const set = (x: number, y: number, r: number, g: number, b: number, isSubject: boolean) => {
    const i = (y * width + x) * 4;
    data[i] = Math.max(0, Math.min(255, r));
    data[i + 1] = Math.max(0, Math.min(255, g));
    data[i + 2] = Math.max(0, Math.min(255, b));
    data[i + 3] = 255;
    if (isSubject) truth[y * width + x] = 1;
  };

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const base = 168 + lowAt(x, y) * 18 + (rand() - 0.5) * 38;
      set(x, y, base, base, base + 2, false);
    }
  }

  // Mug : corps cylindrique sauge + couvercle vert foncé, centré.
  const cx = width / 2;
  const bodyHalf = width * 0.14;
  const bodyTop = height * 0.40;
  const bodyBottom = height * 0.78;
  const lidTop = height * 0.30;
  for (let y = Math.round(lidTop); y < bodyBottom; y++) {
    const isLid = y < bodyTop;
    const half = isLid ? bodyHalf * 1.12 : bodyHalf;
    for (let x = Math.round(cx - half); x <= cx + half; x++) {
      if (x < 0 || x >= width) continue;
      // léger ombrage cylindrique
      const t = Math.abs(x - cx) / half;
      const shade = 1 - 0.18 * t * t;
      const n = (rand() - 0.5) * 6;
      if (isLid) set(x, y, 24 * shade + n, 110 * shade + n, 58 * shade + n, true);
      else set(x, y, 152 * shade + n, 158 * shade + n, 142 * shade + n, true);
    }
  }

  return { image: { width, height, data }, truth };
}

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
