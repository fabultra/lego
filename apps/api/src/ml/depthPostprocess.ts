/**
 * Post-traitement PUR d'une sortie de profondeur monoculaire (Depth Anything),
 * isolé ici sans aucune dépendance native pour rester testable au runner Node.
 *
 * Le réseau renvoie une carte de profondeur relative ("disparité" : valeur
 * grande = proche caméra) à la résolution d'inférence. On la normalise en
 * niveaux de gris 0..255 (contrat du moteur : 255 = proche) puis on la
 * rééchantillonne (bilinéaire) sur la taille de l'image source.
 */

export interface GrayImageData {
  width: number;
  height: number;
  data: Uint8Array;
}

/**
 * Normalise min/max -> 0..255 puis redimensionne en bilinéaire.
 *
 * @param raw    sortie du modèle, lue en row-major (srcH lignes de srcW).
 * @param invert true si le modèle renvoie une distance (grand = loin) au lieu
 *               d'une disparité — on retourne alors le gris pour garder
 *               255 = proche.
 */
export function normalizeAndResizeDepth(
  raw: ArrayLike<number>,
  srcW: number,
  srcH: number,
  dstW: number,
  dstH: number,
  invert = false,
): GrayImageData {
  if (srcW <= 0 || srcH <= 0 || dstW <= 0 || dstH <= 0) {
    throw new Error('normalizeAndResizeDepth: dimensions invalides');
  }
  if (raw.length < srcW * srcH) {
    throw new Error(
      `normalizeAndResizeDepth: sortie trop courte (${raw.length} < ${srcW * srcH})`,
    );
  }

  // 1) min/max sur les valeurs finies.
  let min = Infinity;
  let max = -Infinity;
  for (let i = 0; i < srcW * srcH; i++) {
    const v = raw[i];
    if (!Number.isFinite(v)) continue;
    if (v < min) min = v;
    if (v > max) max = v;
  }
  // Carte plate (ou vide) : gris neutre, le moteur retombera sur un relief doux.
  if (!Number.isFinite(min) || !Number.isFinite(max) || max - min < 1e-9) {
    return { width: dstW, height: dstH, data: new Uint8Array(dstW * dstH).fill(128) };
  }
  const span = max - min;

  // 2) gris source normalisé (réutilisé par l'interpolation).
  const gray = new Float32Array(srcW * srcH);
  for (let i = 0; i < srcW * srcH; i++) {
    const v = Number.isFinite(raw[i]) ? raw[i] : min;
    let g = ((v - min) / span) * 255;
    if (invert) g = 255 - g;
    gray[i] = g;
  }

  // 3) rééchantillonnage bilinéaire (même convention "fill"/étirement que la
  // préparation de l'entrée, donc alignement conservé).
  const out = new Uint8Array(dstW * dstH);
  const sx = srcW > 1 ? (srcW - 1) / Math.max(1, dstW - 1) : 0;
  const sy = srcH > 1 ? (srcH - 1) / Math.max(1, dstH - 1) : 0;
  for (let y = 0; y < dstH; y++) {
    const fy = y * sy;
    const y0 = Math.floor(fy);
    const y1 = Math.min(srcH - 1, y0 + 1);
    const wy = fy - y0;
    for (let x = 0; x < dstW; x++) {
      const fx = x * sx;
      const x0 = Math.floor(fx);
      const x1 = Math.min(srcW - 1, x0 + 1);
      const wx = fx - x0;
      const top = gray[y0 * srcW + x0] * (1 - wx) + gray[y0 * srcW + x1] * wx;
      const bot = gray[y1 * srcW + x0] * (1 - wx) + gray[y1 * srcW + x1] * wx;
      const v = top * (1 - wy) + bot * wy;
      out[y * dstW + x] = v < 0 ? 0 : v > 255 ? 255 : Math.round(v);
    }
  }
  return { width: dstW, height: dstH, data: out };
}
