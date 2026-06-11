import { partDims } from './catalog';
import type { PlacedBrick, StructuralIssue } from './types';

/**
 * Validation structurelle sur le modèle en briques :
 *  - pièces flottantes : composantes non reliées au sol par des contacts
 *    tenon/tube (les petits amas flottants sont supprimés, les gros signalés) ;
 *  - couches fragiles : surface de contact entre deux couches trop faible ;
 *  - jonctions en colonne unique : une seule paire de briques relie deux couches.
 *
 * Retourne les briques conservées + un score 0..1.
 */

interface Rect {
  x0: number;
  y0: number;
  x1: number; // exclusif
  y1: number; // exclusif
}

function brickRect(b: PlacedBrick): Rect {
  const { w, d } = partDims(b.partId, b.rotated);
  return { x0: b.x, y0: b.y, x1: b.x + w, y1: b.y + d };
}

function overlapArea(a: Rect, b: Rect): number {
  const w = Math.min(a.x1, b.x1) - Math.max(a.x0, b.x0);
  const d = Math.min(a.y1, b.y1) - Math.max(a.y0, b.y0);
  return w > 0 && d > 0 ? w * d : 0;
}

export interface StabilityResult {
  bricks: PlacedBrick[];
  issues: StructuralIssue[];
  score: number;
  /** Briques flottantes supprimées (le pipeline doit aussi vider leurs voxels). */
  dropped: PlacedBrick[];
}

export function validateStructure(bricks: PlacedBrick[]): StabilityResult {
  const issues: StructuralIssue[] = [];
  if (bricks.length === 0) {
    return { bricks, issues, score: 0, dropped: [] };
  }

  const byLayer = new Map<number, number[]>();
  bricks.forEach((b, i) => {
    const arr = byLayer.get(b.z) ?? [];
    arr.push(i);
    byLayer.set(b.z, arr);
  });
  const layers = [...byLayer.keys()].sort((a, b) => a - b);
  const rects = bricks.map(brickRect);

  // Graphe de contacts verticaux (couche z <-> z+1).
  const adj: number[][] = bricks.map(() => []);
  const layerContactArea = new Map<number, number>();
  const layerContactPairs = new Map<number, number>();
  for (const z of layers) {
    const upper = byLayer.get(z + 1);
    if (!upper) continue;
    let contact = 0;
    let pairs = 0;
    for (const i of byLayer.get(z)!) {
      for (const j of upper) {
        const a = overlapArea(rects[i], rects[j]);
        if (a > 0) {
          adj[i].push(j);
          adj[j].push(i);
          contact += a;
          pairs++;
        }
      }
    }
    layerContactArea.set(z + 1, contact);
    layerContactPairs.set(z + 1, pairs);
  }

  // Composantes reliées au sol (z minimal = sol, la base y est incluse).
  const groundZ = layers[0];
  const grounded = new Uint8Array(bricks.length);
  const queue: number[] = [];
  bricks.forEach((b, i) => {
    if (b.z === groundZ) {
      grounded[i] = 1;
      queue.push(i);
    }
  });
  while (queue.length > 0) {
    const i = queue.pop()!;
    for (const j of adj[i]) {
      if (!grounded[j]) {
        grounded[j] = 1;
        queue.push(j);
      }
    }
  }

  // Constructibilité = contrainte dure : TOUTE brique sans chemin de contacts
  // tenon/tube vers le sol est retirée. Le pipeline reboucle ensuite
  // (re-fusion) car retirer une brique peut en décrocher d'autres.
  let dropped: PlacedBrick[] = [];
  const floatingIdx = bricks.map((_, i) => i).filter((i) => !grounded[i]);
  let kept = bricks;
  if (floatingIdx.length > 0) {
    const drop = new Set(floatingIdx);
    kept = bricks.filter((_, i) => !drop.has(i));
    dropped = floatingIdx.map((i) => bricks[i]);
    const b = bricks[floatingIdx[0]];
    issues.push({
      kind: 'floating',
      message: `${dropped.length} brique(s) sans appui vertical retirée(s) — zone irréalisable en briques standards.`,
      at: { x: b.x, y: b.y, z: b.z },
    });
  }

  // Couches fragiles / jonctions à brique unique.
  let fragileCount = 0;
  let thinCount = 0;
  for (const z of layers) {
    if (z === groundZ) continue;
    const area = (byLayer.get(z) ?? []).reduce((s, i) => {
      const r = rects[i];
      return s + (r.x1 - r.x0) * (r.y1 - r.y0);
    }, 0);
    const contact = layerContactArea.get(z) ?? 0;
    const pairs = layerContactPairs.get(z) ?? 0;
    if (contact < Math.max(2, 0.1 * area)) {
      fragileCount++;
      issues.push({
        kind: 'fragile_layer',
        message: `Couche ${z} : surface de contact très faible avec la couche inférieure (${contact} tenon(s)).`,
      });
    } else if (pairs === 1) {
      thinCount++;
      issues.push({
        kind: 'thin_column',
        message: `Couche ${z} : reliée à la couche inférieure par une seule brique.`,
      });
    }
  }

  // La pénalité du creusage (briques flottantes retirées) est appliquée par
  // le pipeline, qui connaît le total cumulé sur toutes les itérations.
  const score = Math.max(0, Math.min(1, 1 - 0.15 * fragileCount - 0.08 * thinCount));

  return { bricks: kept, issues, score, dropped };
}
