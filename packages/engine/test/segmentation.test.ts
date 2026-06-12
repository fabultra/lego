import assert from 'node:assert/strict';
import { test } from 'node:test';
import { makeCarpetMugImage, makeMushroomImage } from '../src/demo/sampleImage';
import { SimpleSegmenter } from '../src/segmentation';
import { runPipeline } from '../src/pipeline';

/**
 * Cas adversarial issu d'une vraie photo : mug sauge (faible contraste) sur
 * tapis texturé. Le segmenteur doit récupérer le SUJET, pas les nappes
 * contrastées du tapis.
 */

test('tapis texturé : le mug est récupéré, le tapis rejeté', async () => {
  const { image, truth } = makeCarpetMugImage();
  const seg = await new SimpleSegmenter().segment(image);
  const mask = seg.mask;
  assert.equal(mask.width, image.width, "l'image de test ne doit pas être redimensionnée");

  // Couverture plausible d'un sujet cadré (ni miette, ni la moitié de l'image).
  assert.ok(seg.coverage > 0.04 && seg.coverage < 0.45, `couverture suspecte : ${seg.coverage}`);

  // Rappel : la majorité du mug (vérité terrain) doit être couverte.
  let subjectPx = 0;
  let recovered = 0;
  let maskPx = 0;
  let falsePositive = 0;
  for (let i = 0; i < truth.length; i++) {
    if (truth[i]) {
      subjectPx++;
      if (mask.data[i]) recovered++;
    }
    if (mask.data[i]) {
      maskPx++;
      if (!truth[i]) falsePositive++;
    }
  }
  assert.ok(recovered / subjectPx > 0.55, `rappel trop faible : ${(recovered / subjectPx).toFixed(2)}`);
  // Précision : le masque ne doit pas être dominé par du tapis.
  assert.ok(falsePositive / maskPx < 0.35, `trop de tapis dans le masque : ${(falsePositive / maskPx).toFixed(2)}`);

  // Le masque ne doit pas toucher la bordure (le tapis y est accroché, pas le mug).
  const { width: w, height: h } = mask;
  for (let x = 0; x < w; x++) {
    assert.equal(mask.data[x], 0, 'masque sur le bord haut');
    assert.equal(mask.data[(h - 1) * w + x], 0, 'masque sur le bord bas');
  }
});

test('tapis texturé : le pipeline complet produit un modèle plausible', async () => {
  const { image } = makeCarpetMugImage();
  const r = await runPipeline(image, { size: 'small', detail: 'simple', style: 'realistic' });
  assert.ok(r.bricks.length > 15, `trop peu de briques : ${r.bricks.length}`);
  // Un mug est plus haut que large : la grille doit le refléter.
  assert.ok(r.sizeZ >= r.sizeX, `proportions inattendues : ${r.sizeX}x${r.sizeZ}`);
});

test('régression : le champignon sur fond clair reste bien segmenté', async () => {
  const seg = await new SimpleSegmenter().segment(makeMushroomImage());
  assert.ok(seg.coverage > 0.2 && seg.coverage < 0.45, `couverture champignon : ${seg.coverage}`);
});
