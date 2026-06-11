import assert from 'node:assert/strict';
import { test } from 'node:test';
import { bricksFromVoxels } from '../src/bricks';
import { partDims } from '../src/catalog';
import { gridIndex, type VoxelGrid } from '../src/types';

function solidGrid(sx: number, sy: number, sz: number, color = 0): VoxelGrid {
  return { sx, sy, sz, data: new Int16Array(sx * sy * sz).fill(color) };
}

test('un bloc plein 8x4x3 est couvert avec de grosses briques', () => {
  const g = solidGrid(8, 4, 3);
  const bricks = bricksFromVoxels(g, 0);
  // couverture exacte
  const covered = new Uint8Array(8 * 4 * 3);
  for (const b of bricks) {
    const { w, d } = partDims(b.partId, b.rotated);
    for (let dy = 0; dy < d; dy++) {
      for (let dx = 0; dx < w; dx++) {
        const i = gridIndex(g, b.x + dx, b.y + dy, b.z);
        assert.equal(covered[i], 0);
        covered[i] = 1;
      }
    }
  }
  assert.ok(covered.every((v) => v === 1), 'tous les voxels doivent être couverts');
  // efficacité : 96 voxels -> grosses pièces, pas un mur de 1x1
  assert.ok(bricks.length <= 96 / 3, `trop de pièces : ${bricks.length}`);
  assert.ok(bricks.some((b) => b.partId === '3001'), 'des 2x4 doivent être utilisées');
});

test("les couches alternées s'imbriquent (au moins une brique chevauche 2 briques du dessous)", () => {
  const g = solidGrid(8, 4, 2);
  const bricks = bricksFromVoxels(g, 0);
  const layer0 = bricks.filter((b) => b.z === 0);
  const layer1 = bricks.filter((b) => b.z === 1);
  const overlaps = (a: (typeof bricks)[0], b: (typeof bricks)[0]) => {
    const da = partDims(a.partId, a.rotated);
    const db = partDims(b.partId, b.rotated);
    return (
      Math.min(a.x + da.w, b.x + db.w) > Math.max(a.x, b.x) &&
      Math.min(a.y + da.d, b.y + db.d) > Math.max(a.y, b.y)
    );
  };
  const interlocked = layer1.some((u) => layer0.filter((l) => overlaps(u, l)).length >= 2);
  assert.ok(interlocked, 'aucune imbrication entre les couches 0 et 1');
});

test('une brique ne traverse jamais deux couleurs', () => {
  const g = solidGrid(8, 2, 1, 0);
  // moitié droite dans une autre couleur
  for (let y = 0; y < 2; y++) {
    for (let x = 4; x < 8; x++) g.data[gridIndex(g, x, y, 0)] = 1;
  }
  const bricks = bricksFromVoxels(g, 0);
  for (const b of bricks) {
    const { w, d } = partDims(b.partId, b.rotated);
    const colors = new Set<number>();
    for (let dy = 0; dy < d; dy++) {
      for (let dx = 0; dx < w; dx++) {
        colors.add(g.data[gridIndex(g, b.x + dx, b.y + dy, b.z)]);
      }
    }
    assert.equal(colors.size, 1, `brique ${b.id} traverse deux couleurs`);
  }
});

test('la couche de base utilise des plaques', () => {
  const g = solidGrid(4, 4, 2);
  const bricks = bricksFromVoxels(g, 1);
  const base = bricks.filter((b) => b.z === 0);
  assert.ok(base.length > 0);
  for (const b of base) {
    assert.ok(['3020', '3022', '3023', '3024'].includes(b.partId), `pièce de base inattendue : ${b.partId}`);
  }
  const upper = bricks.filter((b) => b.z === 1);
  for (const b of upper) {
    assert.ok(['3001', '3002', '3003', '3010', '3622', '3004', '3005'].includes(b.partId));
  }
});
