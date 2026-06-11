import type { Mask, RasterImage } from './types';

/**
 * Segmentation MVP, 100% TypeScript, sans modèle ML :
 *  1. estimer la couleur de fond depuis la bordure de l'image (k-means k<=2) ;
 *  2. carte de distance couleur au fond ;
 *  3. seuillage automatique (Otsu) ;
 *  4. remplissage de fond depuis les bords (les trous internes deviennent objet) ;
 *  5. nettoyage morphologique (open puis close) ;
 *  6. conservation de la composante principale.
 *
 * Hypothèse assumée : fond raisonnablement uni et contrasté (l'UX guide la
 * prise de vue). Pour les fonds complexes, brancher un `Segmenter` ML
 * (rembg / SAM / API cloud) via la même interface — voir docs/PIPELINE.md.
 */

export interface SegmentationResult {
  mask: Mask;
  /** Part de l'image couverte par l'objet (0..1). */
  coverage: number;
}

export interface Segmenter {
  segment(image: RasterImage): Promise<SegmentationResult>;
}

/** Redimensionnement nearest-neighbor (suffisant pour la segmentation). */
export function resizeRaster(img: RasterImage, maxDim: number): RasterImage {
  const scale = Math.min(1, maxDim / Math.max(img.width, img.height));
  if (scale === 1) return img;
  const w = Math.max(1, Math.round(img.width * scale));
  const h = Math.max(1, Math.round(img.height * scale));
  const out = new Uint8ClampedArray(w * h * 4);
  for (let y = 0; y < h; y++) {
    const sy = Math.min(img.height - 1, Math.floor((y / h) * img.height));
    for (let x = 0; x < w; x++) {
      const sx = Math.min(img.width - 1, Math.floor((x / w) * img.width));
      const si = (sy * img.width + sx) * 4;
      const di = (y * w + x) * 4;
      out[di] = img.data[si];
      out[di + 1] = img.data[si + 1];
      out[di + 2] = img.data[si + 2];
      out[di + 3] = img.data[si + 3];
    }
  }
  return { width: w, height: h, data: out };
}

/** K-means k<=2 sur des pixels RGB — pour estimer 1 ou 2 teintes de fond. */
function kmeansBackground(pixels: number[][]): number[][] {
  if (pixels.length === 0) return [[255, 255, 255]];
  // Initialisation : pixel le plus clair / le plus sombre de la bordure.
  let lo = pixels[0];
  let hi = pixels[0];
  const lum = (p: number[]) => p[0] * 0.299 + p[1] * 0.587 + p[2] * 0.114;
  for (const p of pixels) {
    if (lum(p) < lum(lo)) lo = p;
    if (lum(p) > lum(hi)) hi = p;
  }
  let centers = [lo.slice(), hi.slice()];
  for (let iter = 0; iter < 8; iter++) {
    const sums = [
      [0, 0, 0, 0],
      [0, 0, 0, 0],
    ];
    for (const p of pixels) {
      const d0 = dist2(p, centers[0]);
      const d1 = dist2(p, centers[1]);
      const k = d0 <= d1 ? 0 : 1;
      sums[k][0] += p[0];
      sums[k][1] += p[1];
      sums[k][2] += p[2];
      sums[k][3]++;
    }
    centers = sums.map((s, i) =>
      s[3] > 0 ? [s[0] / s[3], s[1] / s[3], s[2] / s[3]] : centers[i].slice(),
    );
  }
  // Si les deux centres sont très proches, un seul suffit.
  if (dist2(centers[0], centers[1]) < 20 * 20) return [centers[0]];
  return centers;
}

function dist2(a: number[], b: number[]): number {
  const dr = a[0] - b[0];
  const dg = a[1] - b[1];
  const db = a[2] - b[2];
  return dr * dr + dg * dg + db * db;
}

/** Seuil d'Otsu sur un histogramme 256 bins. */
function otsuThreshold(hist: Float64Array): number {
  let total = 0;
  let sum = 0;
  for (let i = 0; i < 256; i++) {
    total += hist[i];
    sum += i * hist[i];
  }
  if (total === 0) return 128;
  let sumB = 0;
  let wB = 0;
  let best = 128;
  let bestVar = -1;
  for (let t = 0; t < 256; t++) {
    wB += hist[t];
    if (wB === 0) continue;
    const wF = total - wB;
    if (wF === 0) break;
    sumB += t * hist[t];
    const mB = sumB / wB;
    const mF = (sum - sumB) / wF;
    const v = wB * wF * (mB - mF) * (mB - mF);
    if (v > bestVar) {
      bestVar = v;
      best = t;
    }
  }
  return best;
}

function erode(mask: Uint8Array, w: number, h: number): Uint8Array {
  const out = new Uint8Array(w * h);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = y * w + x;
      if (!mask[i]) continue;
      const up = y > 0 ? mask[i - w] : 0;
      const dn = y < h - 1 ? mask[i + w] : 0;
      const lf = x > 0 ? mask[i - 1] : 0;
      const rt = x < w - 1 ? mask[i + 1] : 0;
      out[i] = up && dn && lf && rt ? 1 : 0;
    }
  }
  return out;
}

function dilate(mask: Uint8Array, w: number, h: number): Uint8Array {
  const out = new Uint8Array(w * h);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = y * w + x;
      if (
        mask[i] ||
        (y > 0 && mask[i - w]) ||
        (y < h - 1 && mask[i + w]) ||
        (x > 0 && mask[i - 1]) ||
        (x < w - 1 && mask[i + 1])
      ) {
        out[i] = 1;
      }
    }
  }
  return out;
}

/** Garde la plus grande composante 4-connexe du masque. */
function keepLargestComponent(mask: Uint8Array, w: number, h: number): Uint8Array {
  const labels = new Int32Array(w * h).fill(-1);
  const queue = new Int32Array(w * h);
  let bestLabel = -1;
  let bestSize = 0;
  let label = 0;
  for (let start = 0; start < w * h; start++) {
    if (!mask[start] || labels[start] !== -1) continue;
    let head = 0;
    let tail = 0;
    queue[tail++] = start;
    labels[start] = label;
    let size = 0;
    while (head < tail) {
      const i = queue[head++];
      size++;
      const x = i % w;
      const y = (i / w) | 0;
      const tryPush = (j: number) => {
        if (mask[j] && labels[j] === -1) {
          labels[j] = label;
          queue[tail++] = j;
        }
      };
      if (x > 0) tryPush(i - 1);
      if (x < w - 1) tryPush(i + 1);
      if (y > 0) tryPush(i - w);
      if (y < h - 1) tryPush(i + w);
    }
    if (size > bestSize) {
      bestSize = size;
      bestLabel = label;
    }
    label++;
  }
  const out = new Uint8Array(w * h);
  if (bestLabel >= 0) {
    for (let i = 0; i < w * h; i++) out[i] = labels[i] === bestLabel ? 1 : 0;
  }
  return out;
}

export class SimpleSegmenter implements Segmenter {
  constructor(private readonly workingMaxDim = 384) {}

  async segment(image: RasterImage): Promise<SegmentationResult> {
    const img = resizeRaster(image, this.workingMaxDim);
    const { width: w, height: h, data } = img;

    // 1. Couleurs de fond : anneau de bordure de 2px.
    const border: number[][] = [];
    const pushPx = (x: number, y: number) => {
      const i = (y * w + x) * 4;
      border.push([data[i], data[i + 1], data[i + 2]]);
    };
    for (let x = 0; x < w; x++) {
      pushPx(x, 0);
      pushPx(x, h - 1);
      if (h > 3) {
        pushPx(x, 1);
        pushPx(x, h - 2);
      }
    }
    for (let y = 2; y < h - 2; y++) {
      pushPx(0, y);
      pushPx(w - 1, y);
      if (w > 3) {
        pushPx(1, y);
        pushPx(w - 2, y);
      }
    }
    const bgCenters = kmeansBackground(border);

    // 2. Distance au fond, normalisée sur 0..255.
    const dist = new Float64Array(w * h);
    let maxDist = 1e-6;
    for (let i = 0; i < w * h; i++) {
      const p = [data[i * 4], data[i * 4 + 1], data[i * 4 + 2]];
      let d = Infinity;
      for (const cc of bgCenters) d = Math.min(d, Math.sqrt(dist2(p, cc)));
      dist[i] = d;
      if (d > maxDist) maxDist = d;
    }
    const hist = new Float64Array(256);
    for (let i = 0; i < w * h; i++) {
      hist[Math.min(255, Math.round((dist[i] / maxDist) * 255))]++;
    }

    // 3. Otsu (borné pour éviter un seuil absurde sur image quasi-unie),
    //    avec hystérésis : un pixel "faible" (peu contrasté avec le fond,
    //    ex. pied beige sous un chapeau rouge) n'est retenu que s'il est
    //    connecté à un pixel "fort" — évite qu'Otsu ampute les zones de
    //    l'objet proches de la couleur du fond.
    const t = Math.max(24, otsuThreshold(hist));
    const tLow = Math.max(12, t * 0.4);
    let mask: Uint8Array = new Uint8Array(w * h);
    const norm = (i: number) => (dist[i] / maxDist) * 255;
    {
      const hQueue = new Int32Array(w * h);
      let hTail = 0;
      for (let i = 0; i < w * h; i++) {
        if (norm(i) > t) {
          mask[i] = 1;
          hQueue[hTail++] = i;
        }
      }
      let hHead = 0;
      while (hHead < hTail) {
        const i = hQueue[hHead++];
        const x = i % w;
        const y = (i / w) | 0;
        const grow = (j: number) => {
          if (!mask[j] && norm(j) > tLow) {
            mask[j] = 1;
            hQueue[hTail++] = j;
          }
        };
        if (x > 0) grow(i - 1);
        if (x < w - 1) grow(i + 1);
        if (y > 0) grow(i - w);
        if (y < h - 1) grow(i + w);
      }
    }

    // 4. Fond = remplissage depuis les bords sur ~mask ; les zones "non objet"
    //    enfermées dans l'objet sont des trous -> on les solidifie.
    const outside = new Uint8Array(w * h);
    const queue = new Int32Array(w * h);
    let tail = 0;
    const seed = (i: number) => {
      if (!mask[i] && !outside[i]) {
        outside[i] = 1;
        queue[tail++] = i;
      }
    };
    for (let x = 0; x < w; x++) {
      seed(x);
      seed((h - 1) * w + x);
    }
    for (let y = 0; y < h; y++) {
      seed(y * w);
      seed(y * w + w - 1);
    }
    let head = 0;
    while (head < tail) {
      const i = queue[head++];
      const x = i % w;
      const y = (i / w) | 0;
      if (x > 0) seed(i - 1);
      if (x < w - 1) seed(i + 1);
      if (y > 0) seed(i - w);
      if (y < h - 1) seed(i + w);
    }
    for (let i = 0; i < w * h; i++) {
      if (!outside[i]) mask[i] = 1; // objet ou trou interne
    }

    // 5. Open (retire les poussières) puis close (rebouche les fissures).
    mask = dilate(erode(mask, w, h), w, h);
    mask = erode(dilate(mask, w, h), w, h);

    // 6. Sujet principal uniquement.
    mask = keepLargestComponent(mask, w, h);

    let count = 0;
    for (let i = 0; i < w * h; i++) count += mask[i];

    return {
      mask: { width: w, height: h, data: mask },
      coverage: count / (w * h),
    };
  }
}

/**
 * Point d'extension V2 : segmenteur distant (rembg, SAM, API cloud).
 * L'implémentation réelle vit côté API (elle a accès au réseau) ; le moteur
 * n'impose que le contrat.
 */
export type RemoteSegmenterFn = (image: RasterImage) => Promise<SegmentationResult>;
