import { PARTS } from './catalog';
import type { BomLine, PlacedBrick } from './types';

export const PRICE_DISCLAIMER =
  'Estimation indicative basée sur des prix moyens du marché secondaire (table statique). ' +
  'Sera remplacée par les prix BrickLink en temps réel.';

/** Nomenclature agrégée (part + couleur), triée par quantité décroissante. */
export function buildBom(bricks: PlacedBrick[]): BomLine[] {
  const map = new Map<string, BomLine>();
  for (const b of bricks) {
    const key = `${b.partId}:${b.colorIndex}`;
    let line = map.get(key);
    if (!line) {
      const part = PARTS[b.partId];
      line = {
        partId: b.partId,
        partName: part.name,
        colorIndex: b.colorIndex,
        quantity: 0,
        estUnitPriceCents: part.avgPriceCents,
      };
      map.set(key, line);
    }
    line.quantity++;
  }
  return [...map.values()].sort(
    (a, b) => b.quantity - a.quantity || a.partId.localeCompare(b.partId) || a.colorIndex - b.colorIndex,
  );
}

export function bomTotalCents(bom: BomLine[]): number {
  return bom.reduce((s, l) => s + l.quantity * l.estUnitPriceCents, 0);
}
