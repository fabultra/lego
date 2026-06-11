import type { BuildStep, PlacedBrick } from './types';

/**
 * Génération des instructions de montage :
 *  - couches de bas en haut ;
 *  - dans une couche : de l'arrière (y=0) vers l'avant, puis de gauche à
 *    droite — l'utilisateur ne masque jamais son travail avec ses mains ;
 *  - étapes de ~TARGET_PIECES pièces, sans couper une couche en deux
 *    au milieu d'une rangée de façon arbitraire ;
 *  - chaque étape résume les pièces à prendre (part + couleur + quantité).
 *
 * Mutation assumée : `stepIndex` est écrit sur chaque brique.
 */

const TARGET_PIECES = 6;
const MAX_PIECES = 9;

export function generateInstructions(bricks: PlacedBrick[], baseLayers: number): BuildStep[] {
  const byLayer = new Map<number, PlacedBrick[]>();
  for (const b of bricks) {
    const arr = byLayer.get(b.z) ?? [];
    arr.push(b);
    byLayer.set(b.z, arr);
  }
  const layers = [...byLayer.keys()].sort((a, b) => a - b);

  const steps: BuildStep[] = [];
  let stepIndex = 0;

  for (const z of layers) {
    const layerBricks = byLayer
      .get(z)!
      .slice()
      .sort((a, b) => a.y - b.y || a.x - b.x);

    // Découpe en étapes équilibrées.
    const n = layerBricks.length;
    const stepCount = Math.max(1, Math.ceil(n / TARGET_PIECES));
    const perStep = Math.min(MAX_PIECES, Math.ceil(n / stepCount));

    for (let s = 0; s < n; s += perStep) {
      stepIndex++;
      const chunk = layerBricks.slice(s, s + perStep);
      const summary = new Map<string, { partId: string; colorIndex: number; quantity: number }>();
      for (const b of chunk) {
        b.stepIndex = stepIndex;
        const key = `${b.partId}:${b.colorIndex}`;
        const line = summary.get(key) ?? { partId: b.partId, colorIndex: b.colorIndex, quantity: 0 };
        line.quantity++;
        summary.set(key, line);
      }
      let note: string | null = null;
      if (z < baseLayers && s === 0) note = 'Assembler la base en plaques.';
      else if (s === 0) note = `Couche ${z + 1 - baseLayers} — commencer par l'arrière.`;
      steps.push({
        index: stepIndex,
        layer: z,
        brickIds: chunk.map((b) => b.id),
        pieceSummary: [...summary.values()].sort(
          (a, b) => a.partId.localeCompare(b.partId) || a.colorIndex - b.colorIndex,
        ),
        note,
      });
    }
  }
  return steps;
}
