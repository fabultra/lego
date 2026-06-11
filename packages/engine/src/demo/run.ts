/**
 * Démo bout-en-bout du moteur, sans aucune dépendance :
 *   npm run demo:engine   (depuis la racine)
 *
 * Génère une image synthétique (champignon), exécute le pipeline complet et
 * affiche : stats, vue de face ASCII, nomenclature, premières étapes.
 * Le résultat complet est écrit dans packages/engine/demo.out.json.
 */
import { writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { LEGO_PALETTE } from '../palette';
import { gridIndex } from '../types';
import { runPipeline } from '../pipeline';
import { bomTotalCents } from '../bom';
import { makeMushroomImage } from './sampleImage';

const image = makeMushroomImage();

const result = await runPipeline(
  image,
  { size: 'medium', detail: 'balanced', style: 'realistic' },
  (stage, pct) => console.log(`  [${String(pct).padStart(3)}%] ${stage}`),
);

console.log('\n=== Brickify AI — démo moteur ===');
console.log(`Grille : ${result.sizeX} x ${result.sizeY} x ${result.sizeZ} (L x P x H)`);
console.log(`Voxels : ${result.stats.voxelCount}`);
console.log(`Briques : ${result.bricks.length}  |  Couleurs : ${result.palette.length}  |  Étapes : ${result.steps.length}`);
console.log(`Stabilité : ${(result.stabilityScore * 100).toFixed(0)}%`);
if (result.issues.length > 0) {
  console.log('Alertes :');
  for (const i of result.issues.slice(0, 6)) console.log(`  - [${i.kind}] ${i.message}`);
}

// Vue de face ASCII : pour chaque (x, z), première couleur rencontrée en y.
const glyphs = '#@%*+=o:~-.';
console.log('\nVue de face (1 caractère = 1 tenon) :');
for (let z = result.sizeZ - 1; z >= 0; z--) {
  let row = '';
  for (let x = 0; x < result.sizeX; x++) {
    let ch = ' ';
    for (let y = 0; y < result.sizeY; y++) {
      const v = result.grid.data[gridIndex(result.grid, x, y, z)];
      if (v >= 0) {
        ch = glyphs[v % glyphs.length];
        break;
      }
    }
    row += ch;
  }
  console.log('  ' + row);
}
console.log('\nLégende couleurs :');
result.palette.forEach((c, i) => console.log(`  ${glyphs[i % glyphs.length]}  ${c.name} (#${c.id})`));

console.log('\nNomenclature :');
for (const line of result.bom) {
  const color = result.palette[line.colorIndex];
  console.log(
    `  ${String(line.quantity).padStart(4)} x ${line.partName.padEnd(12)} ${color.name}` +
      `  (~${((line.quantity * line.estUnitPriceCents) / 100).toFixed(2)} €)`,
  );
}
console.log(`  Total : ${result.bricks.length} pièces, ~${(bomTotalCents(result.bom) / 100).toFixed(2)} €`);

console.log('\nPremières étapes :');
for (const s of result.steps.slice(0, 4)) {
  const pieces = s.pieceSummary
    .map((p) => `${p.quantity}x ${p.partId} ${LEGO_PALETTE.find((c) => c.id === result.palette[p.colorIndex].id)?.name}`)
    .join(', ');
  console.log(`  Étape ${s.index} (couche ${s.layer}) : ${pieces}${s.note ? ` — ${s.note}` : ''}`);
}

const outPath = fileURLToPath(new URL('../../demo.out.json', import.meta.url));
const { grid, mask, ...serializable } = result;
writeFileSync(outPath, JSON.stringify(serializable, null, 2));
console.log(`\nRésultat complet écrit dans ${outPath}`);
