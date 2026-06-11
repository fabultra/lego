import type { LegoPart } from './types';

/**
 * Catalogue de pièces autorisées pour la génération MVP : briques courantes
 * uniquement, plaques réservées à la base. Les slopes sont déclarées pour la
 * V2 (niveau "détaillé") mais le placeur MVP ne les utilise pas encore.
 *
 * Les ids sont les design ids LEGO (identiques côté BrickLink et LDraw).
 */
export const PARTS: Record<string, LegoPart> = {
  '3001': { id: '3001', name: 'Brick 2 x 4', widthStuds: 4, depthStuds: 2, heightPlates: 3, kind: 'brick', avgPriceCents: 14 },
  '3002': { id: '3002', name: 'Brick 2 x 3', widthStuds: 3, depthStuds: 2, heightPlates: 3, kind: 'brick', avgPriceCents: 12 },
  '3003': { id: '3003', name: 'Brick 2 x 2', widthStuds: 2, depthStuds: 2, heightPlates: 3, kind: 'brick', avgPriceCents: 8 },
  '3010': { id: '3010', name: 'Brick 1 x 4', widthStuds: 4, depthStuds: 1, heightPlates: 3, kind: 'brick', avgPriceCents: 9 },
  '3622': { id: '3622', name: 'Brick 1 x 3', widthStuds: 3, depthStuds: 1, heightPlates: 3, kind: 'brick', avgPriceCents: 7 },
  '3004': { id: '3004', name: 'Brick 1 x 2', widthStuds: 2, depthStuds: 1, heightPlates: 3, kind: 'brick', avgPriceCents: 5 },
  '3005': { id: '3005', name: 'Brick 1 x 1', widthStuds: 1, depthStuds: 1, heightPlates: 3, kind: 'brick', avgPriceCents: 4 },
  // Plaques : utilisées pour la base auto-ajoutée (et exposées à l'inventaire).
  '3020': { id: '3020', name: 'Plate 2 x 4', widthStuds: 4, depthStuds: 2, heightPlates: 1, kind: 'plate', avgPriceCents: 10 },
  '3022': { id: '3022', name: 'Plate 2 x 2', widthStuds: 2, depthStuds: 2, heightPlates: 1, kind: 'plate', avgPriceCents: 6 },
  '3023': { id: '3023', name: 'Plate 1 x 2', widthStuds: 2, depthStuds: 1, heightPlates: 1, kind: 'plate', avgPriceCents: 4 },
  '3024': { id: '3024', name: 'Plate 1 x 1', widthStuds: 1, depthStuds: 1, heightPlates: 1, kind: 'plate', avgPriceCents: 3 },
  // V2 — niveau détaillé (non utilisé par le placeur MVP) :
  '3040': { id: '3040', name: 'Slope 45 2 x 1', widthStuds: 2, depthStuds: 1, heightPlates: 3, kind: 'slope', avgPriceCents: 6 },
};

/**
 * Ordre d'essai du placeur glouton : surface décroissante, pièces 2xN
 * d'abord (plus stables), puis 1xN. La 1x1 garantit la couverture.
 */
export const BRICK_PRIORITY: string[] = ['3001', '3002', '3003', '3010', '3622', '3004', '3005'];

/** Pièces plates pour la couche de base. */
export const PLATE_PRIORITY: string[] = ['3020', '3022', '3023', '3024'];

export function partDims(partId: string, rotated: boolean): { w: number; d: number } {
  const p = PARTS[partId];
  return rotated ? { w: p.depthStuds, d: p.widthStuds } : { w: p.widthStuds, d: p.depthStuds };
}
