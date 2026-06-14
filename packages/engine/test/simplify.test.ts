import assert from 'node:assert/strict';
import { test } from 'node:test';
import { enforceSupport, fillInternalHoles, removeSmallIslands, simplifyGrid } from '../src/simplify';
import { gridIndex, type VoxelGrid } from '../src/types';
import { nearestLegoColorIndex, LEGO_PALETTE } from '../src/palette';
import { reduceToModelPalette } from '../src/colors';

function emptyGrid(sx: number, sy: number, sz: number): VoxelGrid {
  return { sx, sy, sz, data: new Int16Array(sx * sy * sz).fill(-1) };
}

test("settle : un objet flottant au-dessus du sol n'est pas raboté en cascade (régression 0 pièce)", () => {
  // masse pleine occupant z=2..4 seulement (rien en z=0/z=1) — comme une
  // silhouette dont le bas est passé sous le seuil de couverture.
  const g = emptyGrid(6, 4, 6);
  for (let z = 2; z <= 4; z++) {
    for (let y = 0; y < 4; y++) {
      for (let x = 0; x < 6; x++) g.data[gridIndex(g, x, y, z)] = 0;
    }
  }
  const before = g.data.reduce((n, v) => n + (v >= 0 ? 1 : 0), 0);
  const res = simplifyGrid(g, { minIslandVoxels: 1, addBase: 'never', baseColorIndex: () => 0 });
  const after = res.grid.data.reduce((n, v) => n + (v >= 0 ? 1 : 0), 0);
  assert.equal(after, before, 'aucun voxel ne doit être perdu : le bloc repose désormais sur le sol');
  // la masse a bien été tassée en z=0..2
  let lowest = 99;
  for (let z = 0; z < res.grid.sz; z++) {
    for (let i = 0; i < res.grid.sx * res.grid.sy; i++) {
      if (res.grid.data[z * res.grid.sx * res.grid.sy + i] >= 0) {
        lowest = Math.min(lowest, z);
      }
    }
  }
  assert.equal(lowest, 0, 'la couche la plus basse doit être z=0 après tassement');
});

test('enforceSupport supprime les voxels flottants et garde les petits surplombs', () => {
  const g = emptyGrid(6, 3, 3);
  // colonne supportée en (1,1)
  g.data[gridIndex(g, 1, 1, 0)] = 0;
  g.data[gridIndex(g, 1, 1, 1)] = 0;
  // surplomb latéral adjacent à la colonne (kept)
  g.data[gridIndex(g, 2, 1, 1)] = 0;
  // voxel totalement flottant (removed)
  g.data[gridIndex(g, 5, 2, 2)] = 0;
  const { removed } = enforceSupport(g);
  assert.equal(removed, 1);
  assert.ok(g.data[gridIndex(g, 2, 1, 1)] >= 0, 'le surplomb adjacent doit être conservé');
  assert.ok(g.data[gridIndex(g, 5, 2, 2)] < 0, 'le voxel flottant doit être supprimé');
});

test('removeSmallIslands retire les fragments mais garde le corps principal', () => {
  const g = emptyGrid(10, 3, 3);
  for (let x = 0; x < 5; x++) {
    for (let y = 0; y < 3; y++) g.data[gridIndex(g, x, y, 0)] = 0;
  }
  g.data[gridIndex(g, 9, 2, 2)] = 0; // île d'un voxel
  const removed = removeSmallIslands(g, 4);
  assert.equal(removed, 1);
  assert.ok(g.data[gridIndex(g, 0, 0, 0)] >= 0);
});

test('fillInternalHoles comble une cavité interne', () => {
  const g = emptyGrid(3, 3, 3);
  for (let z = 0; z < 3; z++) {
    for (let y = 0; y < 3; y++) {
      for (let x = 0; x < 3; x++) g.data[gridIndex(g, x, y, z)] = 0;
    }
  }
  g.data[gridIndex(g, 1, 1, 1)] = -1; // creux au centre
  const filled = fillInternalHoles(g);
  assert.equal(filled, 1);
  assert.equal(g.data[gridIndex(g, 1, 1, 1)], 0);
});

test("simplifyGrid ajoute une base quand l'assise est étroite", () => {
  const g = emptyGrid(8, 8, 4);
  // grosse masse en hauteur sur un pied 1x1
  g.data[gridIndex(g, 4, 4, 0)] = 0;
  for (let z = 1; z < 4; z++) {
    for (let y = 3; y <= 5; y++) {
      for (let x = 3; x <= 5; x++) g.data[gridIndex(g, x, y, z)] = 0;
    }
  }
  // NB : la masse au-dessus du pied 1x1 est en surplomb > supportée via BFS (distance <= 5), donc conservée.
  const res = simplifyGrid(g, { minIslandVoxels: 1, addBase: 'auto', baseColorIndex: () => 1 });
  assert.equal(res.baseLayers, 1);
  assert.ok(res.issues.some((i) => i.kind === 'base_added'));
  // la base est bien remplie sous le pied (empreinte dilatée)
  assert.ok(res.grid.data[gridIndex(res.grid, 4, 4, 0)] === 1);
  assert.ok(res.grid.data[gridIndex(res.grid, 3, 4, 0)] === 1);
});

test('couleurs : mapping LEGO le plus proche et réduction de palette', () => {
  const redIdx = nearestLegoColorIndex(201, 26, 9);
  assert.equal(LEGO_PALETTE[redIdx].name, 'Red');
  const whiteIdx = nearestLegoColorIndex(250, 250, 250);
  assert.equal(LEGO_PALETTE[whiteIdx].name, 'White');

  const g = emptyGrid(4, 1, 1);
  g.data[0] = redIdx;
  g.data[1] = redIdx;
  g.data[2] = whiteIdx;
  g.data[3] = nearestLegoColorIndex(114, 14, 15); // Dark Red
  const { palette } = reduceToModelPalette(g, 2);
  assert.equal(palette.length, 2);
  // Dark Red (1 voxel) remappé vers la couleur conservée la plus proche : Red
  assert.equal(palette[g.data[3]].name, 'Red');
});
