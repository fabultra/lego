import assert from 'node:assert/strict';
import { test } from 'node:test';
import { normalizeAndResizeDepth } from '../src/ml/depthPostprocess';

test('normalise min->0 et max->255 (disparité, 255 = proche)', () => {
  const { width, height, data } = normalizeAndResizeDepth([0, 1, 2, 3], 2, 2, 2, 2);
  assert.equal(width, 2);
  assert.equal(height, 2);
  assert.deepEqual(Array.from(data), [0, 85, 170, 255]);
});

test('invert retourne le gris (grand = loin -> sombre)', () => {
  const { data } = normalizeAndResizeDepth([0, 1, 2, 3], 2, 2, 2, 2, true);
  assert.deepEqual(Array.from(data), [255, 170, 85, 0]);
});

test('carte plate -> gris neutre 128 (le moteur lisse ensuite)', () => {
  const { data } = normalizeAndResizeDepth([5, 5, 5, 5], 2, 2, 3, 3);
  assert.equal(data.length, 9);
  assert.ok(Array.from(data).every((v) => v === 128));
});

test('redimensionne aux dimensions cibles', () => {
  const { width, height, data } = normalizeAndResizeDepth([0, 255, 0, 255], 2, 2, 8, 4);
  assert.equal(width, 8);
  assert.equal(height, 4);
  assert.equal(data.length, 32);
  // Coins préservés : haut-gauche = 0, haut-droit = 255.
  assert.equal(data[0], 0);
  assert.equal(data[7], 255);
});

test('interpolation bilinéaire : milieu d’un dégradé horizontal', () => {
  // 1x2 [0,255] étiré sur 1x3 -> milieu ~128.
  const { data } = normalizeAndResizeDepth([0, 255], 2, 1, 3, 1);
  assert.equal(data[0], 0);
  assert.equal(data[2], 255);
  assert.ok(Math.abs(data[1] - 128) <= 1);
});

test('rejette une sortie trop courte', () => {
  assert.throws(() => normalizeAndResizeDepth([0, 1, 2], 2, 2, 2, 2), /trop courte/);
});

test('ignore les valeurs non finies pour le min/max', () => {
  const { data } = normalizeAndResizeDepth([Number.NaN, 0, 10, 20], 2, 2, 2, 2);
  // min=0, max=20 ; le NaN est mappé sur min -> 0.
  assert.equal(data[0], 0);
  assert.equal(data[3], 255);
});
