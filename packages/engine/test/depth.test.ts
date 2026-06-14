import assert from 'node:assert/strict';
import { test } from 'node:test';
import { estimateDepth } from '../src/depth';
import type { Silhouette } from '../src/types';
import { makeMushroomImage } from '../src/demo/sampleImage';
import { runPipeline } from '../src/pipeline';

function fullSilhouette(sx: number, sz: number, depth?: Float32Array): Silhouette {
  return {
    sx,
    sz,
    occupancy: new Uint8Array(sx * sz).fill(1),
    colors: new Uint8ClampedArray(sx * sz * 3).fill(128),
    depth,
  };
}

test("relief ML : l'épaisseur suit la carte de profondeur (255 = proche = épais)", () => {
  const sx = 10;
  const sz = 4;
  // gradient gauche (loin, sombre) -> droite (proche, clair)
  const cellDepth = new Float32Array(sx * sz);
  for (let z = 0; z < sz; z++) {
    for (let x = 0; x < sx; x++) cellDepth[z * sx + x] = (x / (sx - 1)) * 255;
  }
  const s = fullSilhouette(sx, sz, cellDepth);
  const dm = estimateDepth(s, 'rounded', 10);
  const left = dm.depth[0];
  const right = dm.depth[sx - 1];
  assert.ok(right > left, `attendu droite > gauche, obtenu ${left} -> ${right}`);
  for (let i = 0; i < sx * sz; i++) {
    assert.ok(dm.depth[i] >= 1 && dm.depth[i] <= 10, `épaisseur hors bornes : ${dm.depth[i]}`);
  }
  // monotone le long du gradient
  for (let x = 1; x < sx; x++) {
    assert.ok(dm.depth[x] >= dm.depth[x - 1], 'le relief doit être monotone le long du gradient');
  }
});

test('sans carte de profondeur, le profil elliptique reste inchangé (régression)', () => {
  // disque ~réaliste : bordure vide autour (cas nominal d'une silhouette)
  const sx = 11;
  const sz = 11;
  const s = fullSilhouette(sx, sz);
  for (let z = 0; z < sz; z++) {
    for (let x = 0; x < sx; x++) {
      const inside = Math.hypot(x - 5, z - 5) <= 4.5;
      s.occupancy[z * sx + x] = inside ? 1 : 0;
    }
  }
  const dm = estimateDepth(s, 'rounded', 8);
  const center = dm.depth[5 * sx + 5];
  const edge = dm.depth[5 * sx + 1];
  assert.ok(center > edge, `le centre (${center}) doit être plus épais que le bord (${edge})`);
});

test('pipeline avec depthImage : déterministe et constructible', async () => {
  const image = makeMushroomImage();
  // profondeur synthétique : vignette radiale (centre proche)
  const depthData = new Uint8Array(image.width * image.height);
  const cx = image.width / 2;
  const cy = image.height / 2;
  const maxR = Math.hypot(cx, cy);
  for (let y = 0; y < image.height; y++) {
    for (let x = 0; x < image.width; x++) {
      const r = Math.hypot(x - cx, y - cy) / maxR;
      depthData[y * image.width + x] = Math.round(255 * (1 - r));
    }
  }
  const depthImage = { width: image.width, height: image.height, data: depthData };
  const a = await runPipeline(image, { size: 'small', detail: 'simple', style: 'realistic', depthImage });
  const b = await runPipeline(image, { size: 'small', detail: 'simple', style: 'realistic', depthImage });
  assert.ok(a.bricks.length > 15);
  assert.equal(JSON.stringify(a.bricks), JSON.stringify(b.bricks));
  // le relief doit différer du profil elliptique pur
  const plain = await runPipeline(image, { size: 'small', detail: 'simple', style: 'realistic' });
  assert.notEqual(JSON.stringify(a.bom), JSON.stringify(plain.bom));
});
