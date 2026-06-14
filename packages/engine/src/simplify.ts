import { gridIndex, type StructuralIssue, type VoxelGrid } from './types';

/**
 * Simplification de la grille pour garantir la constructibilité physique :
 *  1. suppression des îlots de voxels trop petits (poussière de voxelisation) ;
 *  2. comblement des cavités internes inaccessibles ;
 *  3. règle de support : chaque voxel doit reposer sur un voxel, ou être
 *     rattaché latéralement (dans sa couche) à un voxel supporté à moins de
 *     MAX_CANTILEVER cellules — c'est ce qui permet aux briques fusionnées
 *     de porter de petits surplombs, sans autoriser de pièces flottantes ;
 *  4. ajout optionnel d'une base en plaques si l'assise est étroite.
 *
 * NOTE volume : le MVP garde l'intérieur plein (estimation de pièces majorée
 * mais constructible trivialement). Le creusage avec treillis de soutien
 * interne est planifié en V2 — voir docs/PIPELINE.md.
 */

const MAX_CANTILEVER = 5;

export interface SimplifyResult {
  grid: VoxelGrid;
  /** Nombre de couches de base ajoutées (0 ou 1) — toujours en bas (z=0). */
  baseLayers: number;
  removedIslands: number;
  filledHoles: number;
  removedUnsupported: number;
  issues: StructuralIssue[];
}

const NEIGHBORS_6: [number, number, number][] = [
  [1, 0, 0],
  [-1, 0, 0],
  [0, 1, 0],
  [0, -1, 0],
  [0, 0, 1],
  [0, 0, -1],
];

function forEachFilled(g: VoxelGrid, fn: (x: number, y: number, z: number, i: number) => void): void {
  for (let z = 0; z < g.sz; z++) {
    for (let y = 0; y < g.sy; y++) {
      for (let x = 0; x < g.sx; x++) {
        const i = gridIndex(g, x, y, z);
        if (g.data[i] >= 0) fn(x, y, z, i);
      }
    }
  }
}

/** Composantes 6-connexes ; supprime celles < minVoxels (la plus grande est toujours gardée). */
export function removeSmallIslands(g: VoxelGrid, minVoxels: number): number {
  const n = g.sx * g.sy * g.sz;
  const labels = new Int32Array(n).fill(-1);
  const queue = new Int32Array(n);
  const sizes: number[] = [];
  let label = 0;
  for (let start = 0; start < n; start++) {
    if (g.data[start] < 0 || labels[start] !== -1) continue;
    let head = 0;
    let tail = 0;
    queue[tail++] = start;
    labels[start] = label;
    let size = 0;
    while (head < tail) {
      const i = queue[head++];
      size++;
      const x = i % g.sx;
      const y = ((i / g.sx) | 0) % g.sy;
      const z = (i / (g.sx * g.sy)) | 0;
      for (const [dx, dy, dz] of NEIGHBORS_6) {
        const nx = x + dx;
        const ny = y + dy;
        const nz = z + dz;
        if (nx < 0 || ny < 0 || nz < 0 || nx >= g.sx || ny >= g.sy || nz >= g.sz) continue;
        const j = gridIndex(g, nx, ny, nz);
        if (g.data[j] >= 0 && labels[j] === -1) {
          labels[j] = label;
          queue[tail++] = j;
        }
      }
    }
    sizes.push(size);
    label++;
  }
  if (sizes.length <= 1) return 0;
  const largest = sizes.indexOf(Math.max(...sizes));
  let removed = 0;
  for (let i = 0; i < n; i++) {
    const l = labels[i];
    if (l >= 0 && l !== largest && sizes[l] < minVoxels) {
      g.data[i] = -1;
      removed++;
    }
  }
  return removed;
}

/** Comble les poches d'air internes (non connectées à l'extérieur). */
export function fillInternalHoles(g: VoxelGrid): number {
  const n = g.sx * g.sy * g.sz;
  const outside = new Uint8Array(n);
  const queue = new Int32Array(n);
  let tail = 0;
  const seed = (x: number, y: number, z: number) => {
    const i = gridIndex(g, x, y, z);
    if (g.data[i] < 0 && !outside[i]) {
      outside[i] = 1;
      queue[tail++] = i;
    }
  };
  for (let z = 0; z < g.sz; z++) {
    for (let y = 0; y < g.sy; y++) {
      seed(0, y, z);
      seed(g.sx - 1, y, z);
    }
    for (let x = 0; x < g.sx; x++) {
      seed(x, 0, z);
      seed(x, g.sy - 1, z);
    }
  }
  for (let y = 0; y < g.sy; y++) {
    for (let x = 0; x < g.sx; x++) {
      seed(x, y, 0);
      seed(x, y, g.sz - 1);
    }
  }
  let head = 0;
  while (head < tail) {
    const i = queue[head++];
    const x = i % g.sx;
    const y = ((i / g.sx) | 0) % g.sy;
    const z = (i / (g.sx * g.sy)) | 0;
    for (const [dx, dy, dz] of NEIGHBORS_6) {
      const nx = x + dx;
      const ny = y + dy;
      const nz = z + dz;
      if (nx < 0 || ny < 0 || nz < 0 || nx >= g.sx || ny >= g.sy || nz >= g.sz) continue;
      const j = gridIndex(g, nx, ny, nz);
      if (g.data[j] < 0 && !outside[j]) {
        outside[j] = 1;
        queue[tail++] = j;
      }
    }
  }
  let filled = 0;
  for (let i = 0; i < n; i++) {
    if (g.data[i] < 0 && !outside[i]) {
      // couleur majoritaire des voisins remplis
      const x = i % g.sx;
      const y = ((i / g.sx) | 0) % g.sy;
      const z = (i / (g.sx * g.sy)) | 0;
      const counts = new Map<number, number>();
      for (const [dx, dy, dz] of NEIGHBORS_6) {
        const nx = x + dx;
        const ny = y + dy;
        const nz = z + dz;
        if (nx < 0 || ny < 0 || nz < 0 || nx >= g.sx || ny >= g.sy || nz >= g.sz) continue;
        const v = g.data[gridIndex(g, nx, ny, nz)];
        if (v >= 0) counts.set(v, (counts.get(v) ?? 0) + 1);
      }
      let best = 0;
      let bestN = -1;
      for (const [col, cnt] of counts) {
        if (cnt > bestN) {
          bestN = cnt;
          best = col;
        }
      }
      g.data[i] = best;
      filled++;
    }
  }
  return filled;
}

/**
 * Règle de support, appliquée couche par couche de bas en haut :
 * un voxel de la couche z est gardé s'il a un voxel sous lui, ou s'il est
 * connecté (4-connexité dans la couche) à un voxel supporté à <= MAX_CANTILEVER
 * cellules. Les voxels orphelins sont supprimés.
 */
export function enforceSupport(g: VoxelGrid): { removed: number; samples: { x: number; y: number; z: number }[] } {
  let removed = 0;
  const samples: { x: number; y: number; z: number }[] = [];
  const layerN = g.sx * g.sy;
  const dist = new Int32Array(layerN);
  const queue = new Int32Array(layerN);

  for (let z = 1; z < g.sz; z++) {
    dist.fill(-1);
    let tail = 0;
    for (let y = 0; y < g.sy; y++) {
      for (let x = 0; x < g.sx; x++) {
        const i = gridIndex(g, x, y, z);
        if (g.data[i] < 0) continue;
        const below = gridIndex(g, x, y, z - 1);
        if (g.data[below] >= 0) {
          const li = y * g.sx + x;
          dist[li] = 0;
          queue[tail++] = li;
        }
      }
    }
    let head = 0;
    while (head < tail) {
      const li = queue[head++];
      const x = li % g.sx;
      const y = (li / g.sx) | 0;
      const d = dist[li];
      const tryN = (nx: number, ny: number) => {
        if (nx < 0 || ny < 0 || nx >= g.sx || ny >= g.sy) return;
        const nli = ny * g.sx + nx;
        if (dist[nli] !== -1) return;
        if (g.data[gridIndex(g, nx, ny, z)] < 0) return;
        dist[nli] = d + 1;
        queue[tail++] = nli;
      };
      tryN(x - 1, y);
      tryN(x + 1, y);
      tryN(x, y - 1);
      tryN(x, y + 1);
    }
    for (let y = 0; y < g.sy; y++) {
      for (let x = 0; x < g.sx; x++) {
        const i = gridIndex(g, x, y, z);
        if (g.data[i] < 0) continue;
        const li = y * g.sx + x;
        if (dist[li] === -1 || dist[li] > MAX_CANTILEVER) {
          g.data[i] = -1;
          removed++;
          if (samples.length < 5) samples.push({ x, y, z });
        }
      }
    }
  }
  return { removed, samples };
}

/**
 * Tasse le modèle sur le sol : décale toute la grille vers le bas pour que la
 * couche occupée la plus basse devienne z=0.
 *
 * Indispensable avant `enforceSupport` : si l'objet « flotte » au-dessus de
 * z=0 (fréquent quand le bas de la silhouette est arrondi/pointu et que la
 * couverture des cellules du bas passe sous le seuil), la règle de support
 * raboterait TOUT en cascade (couche z=1 non soutenue par un z=0 vide, puis
 * z=2 par un z=1 désormais vide, etc.) — d'où des modèles à 0 pièce.
 * Retourne le nombre de couches vides supprimées sous le modèle.
 */
export function settleToGround(g: VoxelGrid): number {
  let minZ = -1;
  for (let z = 0; z < g.sz && minZ < 0; z++) {
    for (let i = 0; i < g.sx * g.sy; i++) {
      if (g.data[z * g.sx * g.sy + i] >= 0) {
        minZ = z;
        break;
      }
    }
  }
  if (minZ <= 0) return Math.max(0, minZ);
  const layer = g.sx * g.sy;
  g.data.copyWithin(0, minZ * layer);
  g.data.fill(-1, (g.sz - minZ) * layer);
  return minZ;
}

/** Aire (en cellules) de la couche z. */
function layerArea(g: VoxelGrid, z: number): number {
  let a = 0;
  for (let y = 0; y < g.sy; y++) {
    for (let x = 0; x < g.sx; x++) {
      if (g.data[gridIndex(g, x, y, z)] >= 0) a++;
    }
  }
  return a;
}

/**
 * Ajoute une couche de base (plaques, couleur neutre) sous le modèle :
 * empreinte de la couche 0 dilatée d'un tenon. Toute la grille remonte de 1.
 */
export function addBaseLayer(g: VoxelGrid, baseColorIndex: number): VoxelGrid {
  const out: VoxelGrid = {
    sx: g.sx,
    sy: g.sy,
    sz: g.sz + 1,
    data: new Int16Array(g.sx * g.sy * (g.sz + 1)).fill(-1),
  };
  // copie décalée
  out.data.set(g.data, g.sx * g.sy);
  // base = empreinte z0 dilatée (8-connexité)
  for (let y = 0; y < g.sy; y++) {
    for (let x = 0; x < g.sx; x++) {
      let covered = false;
      for (let dy = -1; dy <= 1 && !covered; dy++) {
        for (let dx = -1; dx <= 1 && !covered; dx++) {
          const nx = x + dx;
          const ny = y + dy;
          if (nx < 0 || ny < 0 || nx >= g.sx || ny >= g.sy) continue;
          if (g.data[gridIndex(g, nx, ny, 0)] >= 0) covered = true;
        }
      }
      if (covered) out.data[gridIndex(out, x, y, 0)] = baseColorIndex;
    }
  }
  return out;
}

export interface SimplifyOptions {
  minIslandVoxels: number;
  addBase: 'auto' | 'always' | 'never';
  /**
   * Index (palette du modèle) de la couleur des plaques de base — appelé
   * uniquement si une base est réellement ajoutée (peut étendre la palette).
   */
  baseColorIndex: () => number;
}

export function simplifyGrid(g: VoxelGrid, opts: SimplifyOptions): SimplifyResult {
  const issues: StructuralIssue[] = [];

  const removedIslands = removeSmallIslands(g, opts.minIslandVoxels);
  const filledHoles = fillInternalHoles(g);
  settleToGround(g); // l'objet doit reposer sur le sol avant la règle de support
  const support = enforceSupport(g);
  // enforceSupport peut isoler des fragments -> seconde passe d'îlots.
  const removedIslands2 = removeSmallIslands(g, opts.minIslandVoxels);

  for (const s of support.samples) {
    issues.push({
      kind: 'floating',
      message: `Voxels sans support retirés autour de (${s.x}, ${s.y}, ${s.z})`,
      at: s,
    });
  }

  let grid = g;
  let baseLayers = 0;
  if (opts.addBase !== 'never') {
    let maxArea = 0;
    for (let z = 0; z < g.sz; z++) maxArea = Math.max(maxArea, layerArea(g, z));
    const bottomArea = layerArea(g, 0);
    const narrowFooting = bottomArea > 0 && bottomArea < 0.45 * maxArea;
    if (opts.addBase === 'always' || narrowFooting) {
      grid = addBaseLayer(g, opts.baseColorIndex());
      baseLayers = 1;
      issues.push({
        kind: 'base_added',
        message: 'Base en plaques ajoutée pour stabiliser le modèle (assise étroite).',
      });
    }
  }

  return {
    grid,
    baseLayers,
    removedIslands: removedIslands + removedIslands2,
    filledHoles,
    removedUnsupported: support.removed,
    issues,
  };
}
