/**
 * Génère une photo de test (champignon synthétique) pour essayer l'API sans
 * vraie photo :
 *   npx tsx scripts/make-sample-photo.ts [chemin.jpg]
 */
import sharp from 'sharp';
import { makeMushroomImage } from '@brickify/engine';

const out = process.argv[2] ?? 'sample-photo.jpg';
const img = makeMushroomImage(480, 600);
await sharp(Buffer.from(img.data), {
  raw: { width: img.width, height: img.height, channels: 4 },
})
  .jpeg({ quality: 90 })
  .toFile(out);
console.log(`photo de test écrite : ${out}`);
