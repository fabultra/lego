import assert from 'node:assert/strict';
import { test } from 'node:test';
import { makeMushroomImage } from '../src/demo/sampleImage';
import { runPipeline } from '../src/pipeline';
import { partDims } from '../src/catalog';
import { gridIndex, type PipelineResult } from '../src/types';
import { validateStructure } from '../src/stability';

const image = makeMushroomImage();

async function run(): Promise<PipelineResult> {
  return runPipeline(image, { size: 'medium', detail: 'balanced', style: 'realistic' });
}

test('le pipeline produit un modèle non vide avec briques, étapes et BOM', async () => {
  const r = await run();
  assert.ok(r.bricks.length > 20, `attendu > 20 briques, obtenu ${r.bricks.length}`);
  assert.ok(r.steps.length > 0);
  assert.ok(r.bom.length > 0);
  assert.ok(r.palette.length >= 2, 'le champignon doit produire au moins 2 couleurs');
  assert.ok(r.sizeZ > 4, 'le modèle doit avoir plusieurs couches');
});

test('les briques recouvrent exactement les voxels (couverture exacte, sans chevauchement)', async () => {
  const r = await run();
  const seen = new Int16Array(r.grid.data); // copie : on "consomme" les voxels
  for (const b of r.bricks) {
    const { w, d } = partDims(b.partId, b.rotated);
    for (let dy = 0; dy < d; dy++) {
      for (let dx = 0; dx < w; dx++) {
        const i = gridIndex(r.grid, b.x + dx, b.y + dy, b.z);
        assert.ok(seen[i] >= 0, `brique ${b.id} couvre un voxel vide ou déjà couvert en (${b.x + dx},${b.y + dy},${b.z})`);
        assert.equal(seen[i], b.colorIndex, `brique ${b.id} : couleur incohérente`);
        seen[i] = -1;
      }
    }
  }
  for (let i = 0; i < seen.length; i++) {
    assert.ok(seen[i] < 0, `voxel ${i} non couvert par une brique`);
  }
});

test('chaque brique appartient à exactement une étape, les étapes vont de bas en haut', async () => {
  const r = await run();
  const fromSteps = new Map<string, number>();
  let prevLayer = -1;
  for (const s of r.steps) {
    assert.ok(s.layer >= prevLayer, 'les étapes doivent monter couche par couche');
    prevLayer = s.layer;
    for (const id of s.brickIds) {
      assert.ok(!fromSteps.has(id), `brique ${id} posée deux fois`);
      fromSteps.set(id, s.index);
    }
  }
  assert.equal(fromSteps.size, r.bricks.length);
  for (const b of r.bricks) {
    assert.equal(fromSteps.get(b.id), b.stepIndex);
  }
});

test('la BOM correspond exactement aux briques placées', async () => {
  const r = await run();
  const total = r.bom.reduce((s, l) => s + l.quantity, 0);
  assert.equal(total, r.bricks.length);
});

test('aucune brique flottante dans le résultat final', async () => {
  const r = await run();
  const recheck = validateStructure(r.bricks);
  assert.equal(recheck.dropped.length, 0);
  assert.ok(!recheck.issues.some((i) => i.kind === 'floating'));
});

test('le pipeline est déterministe', async () => {
  const a = await run();
  const b = await run();
  assert.equal(JSON.stringify(a.bricks), JSON.stringify(b.bricks));
  assert.equal(JSON.stringify(a.bom), JSON.stringify(b.bom));
});

test('les styles produisent des géométries différentes', async () => {
  const real = await runPipeline(image, { size: 'small', detail: 'simple', style: 'realistic' });
  const pixel = await runPipeline(image, { size: 'small', detail: 'simple', style: 'pixel_art' });
  assert.ok(pixel.sizeY < real.sizeY, 'pixel_art doit être nettement plus plat que realistic');
});
