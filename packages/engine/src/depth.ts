import type { DepthMap, DepthMode, Silhouette } from './types';

/**
 * Estimation de profondeur MVP — honnête : on ne reconstruit PAS la 3D.
 * On extrude la silhouette le long de y avec deux profils :
 *
 *  - 'flat'    : profondeur constante (pixel art, sculpture plate).
 *  - 'rounded' : profondeur fonction de la distance au bord de la silhouette
 *                (transformée de distance), avec un profil elliptique. Un
 *                point au centre de la forme est plus "épais" qu'un point en
 *                bord -> rend les objets organiques bien plus crédibles
 *                qu'une extrusion plate, sans aucune reconstruction 3D.
 *
 * V2 : remplacer par une carte de profondeur monoculaire (MiDaS/DepthAnything)
 * ou une reconstruction multi-vues — même signature de sortie.
 */

/** Transformée de distance (chamfer 3-4) : distance au fond, en cellules. */
export function distanceTransform(s: Silhouette): Float32Array {
  const { sx, sz, occupancy } = s;
  const INF = 1e9;
  const d = new Float32Array(sx * sz);
  for (let i = 0; i < sx * sz; i++) d[i] = occupancy[i] ? INF : 0;
  // passe avant
  for (let z = 0; z < sz; z++) {
    for (let x = 0; x < sx; x++) {
      const i = z * sx + x;
      if (d[i] === 0) continue;
      let v = d[i];
      if (x > 0) v = Math.min(v, d[i - 1] + 3);
      if (z > 0) {
        v = Math.min(v, d[i - sx] + 3);
        if (x > 0) v = Math.min(v, d[i - sx - 1] + 4);
        if (x < sx - 1) v = Math.min(v, d[i - sx + 1] + 4);
      }
      d[i] = v;
    }
  }
  // passe arrière
  for (let z = sz - 1; z >= 0; z--) {
    for (let x = sx - 1; x >= 0; x--) {
      const i = z * sx + x;
      if (d[i] === 0) continue;
      let v = d[i];
      if (x < sx - 1) v = Math.min(v, d[i + 1] + 3);
      if (z < sz - 1) {
        v = Math.min(v, d[i + sx] + 3);
        if (x < sx - 1) v = Math.min(v, d[i + sx + 1] + 4);
        if (x > 0) v = Math.min(v, d[i + sx - 1] + 4);
      }
      d[i] = v;
    }
  }
  for (let i = 0; i < sx * sz; i++) d[i] = d[i] / 3; // ~distance en cellules
  return d;
}

export function estimateDepth(
  s: Silhouette,
  mode: DepthMode,
  maxDepthStuds: number,
  /** 'blocky' : quantifie la profondeur par paliers de 2 pour un look sculpté. */
  quantizeStep = 1,
): DepthMap {
  const { sx, sz } = s;
  const depth = new Uint8Array(sx * sz);
  const maxDepth = Math.max(1, maxDepthStuds);

  if (mode === 'flat') {
    for (let i = 0; i < sx * sz; i++) {
      if (s.occupancy[i]) depth[i] = maxDepth;
    }
    return { sx, sz, depth };
  }

  // Relief ML : quand la silhouette porte une profondeur mesurée (carte
  // monoculaire, 255 = proche), l'épaisseur suit le relief réel normalisé
  // entre les percentiles 5 et 95 de l'objet — un nez ressort, un creux
  // rentre. Sinon, profil elliptique déduit de la forme (ci-dessous).
  if (mode === 'rounded' && s.depth) {
    const values: number[] = [];
    for (let i = 0; i < sx * sz; i++) if (s.occupancy[i]) values.push(s.depth[i]);
    values.sort((a, b) => a - b);
    const p = (q: number) => values[Math.min(values.length - 1, Math.floor(q * values.length))];
    const lo = p(0.05);
    const hi = p(0.95);
    const span = Math.max(1e-3, hi - lo);
    for (let i = 0; i < sx * sz; i++) {
      if (!s.occupancy[i]) continue;
      const rel = Math.max(0, Math.min(1, (s.depth[i] - lo) / span));
      let dep = Math.round(maxDepth * (0.2 + 0.8 * rel));
      dep = Math.max(1, Math.min(maxDepth, dep));
      if (quantizeStep > 1) dep = Math.max(1, Math.round(dep / quantizeStep) * quantizeStep);
      depth[i] = dep;
    }
    return { sx, sz, depth };
  }

  const dt = distanceTransform(s);
  let dtMax = 0;
  for (let i = 0; i < sx * sz; i++) if (dt[i] > dtMax) dtMax = dt[i];
  if (dtMax <= 0) dtMax = 1;

  for (let i = 0; i < sx * sz; i++) {
    if (!s.occupancy[i]) continue;
    const rel = Math.min(1, dt[i] / dtMax); // 0 = bord, 1 = coeur
    // Profil elliptique : épaisseur = maxDepth * sqrt(rel * (2 - rel)).
    let dep = Math.round(maxDepth * Math.sqrt(rel * (2 - rel)));
    dep = Math.max(1, Math.min(maxDepth, dep));
    if (quantizeStep > 1) {
      dep = Math.max(1, Math.round(dep / quantizeStep) * quantizeStep);
    }
    depth[i] = dep;
  }
  return { sx, sz, depth };
}
