import sharp from 'sharp';
import { makeCarpetMugImage } from '@brickify/engine';
const token = process.env.REPLICATE_API_TOKEN!;
const headers = { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' };
const model = await (await fetch('https://api.replicate.com/v1/models/chenxwh/depth-anything-v2', { headers })).json();
const { image } = makeCarpetMugImage();
const jpeg = await sharp(Buffer.from(image.data), { raw: { width: image.width, height: image.height, channels: 4 } }).jpeg({ quality: 90 }).toBuffer();
let pred = await (await fetch('https://api.replicate.com/v1/predictions', {
  method: 'POST', headers,
  body: JSON.stringify({ version: model.latest_version.id, input: { image: `data:image/jpeg;base64,${jpeg.toString('base64')}` } }),
})).json();
const deadline = Date.now() + 480000;
while ((pred.status === 'starting' || pred.status === 'processing') && Date.now() < deadline) {
  await new Promise((r) => setTimeout(r, 5000));
  pred = await (await fetch(`https://api.replicate.com/v1/predictions/${pred.id}`, { headers })).json();
}
console.log(`status final: ${pred.status}`);
console.log('output:', JSON.stringify(pred.output).slice(0, 250));
if (pred.error) console.log('error:', JSON.stringify(pred.error).slice(0, 200));
