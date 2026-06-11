import sharp from 'sharp';
import type { Mask, RasterImage } from '@brickify/engine';
import { config } from './config';

/**
 * Pont entre le monde des fichiers (JPEG/PNG, EXIF…) et le moteur pur
 * (RasterImage RGBA). Toute la dépendance à sharp est isolée ici.
 */

export interface DecodedImage {
  raster: RasterImage;
  /** JPEG normalisé (orientation EXIF appliquée, taille bornée) à archiver. */
  normalizedJpeg: Buffer;
  width: number;
  height: number;
}

export async function decodeUpload(buffer: Buffer): Promise<DecodedImage> {
  const normalizedJpeg = await sharp(buffer)
    .rotate() // applique l'orientation EXIF
    .resize({
      width: config.limits.maxImageDim,
      height: config.limits.maxImageDim,
      fit: 'inside',
      withoutEnlargement: true,
    })
    .jpeg({ quality: 88 })
    .toBuffer();

  const { data, info } = await sharp(normalizedJpeg)
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });

  return {
    raster: {
      width: info.width,
      height: info.height,
      data: new Uint8ClampedArray(data.buffer, data.byteOffset, data.length),
    },
    normalizedJpeg,
    width: info.width,
    height: info.height,
  };
}

/** Masque -> PNG : objet blanc opaque, fond transparent (overlay côté client). */
export async function maskToPng(mask: Mask): Promise<Buffer> {
  const rgba = Buffer.alloc(mask.width * mask.height * 4);
  for (let i = 0; i < mask.data.length; i++) {
    if (mask.data[i]) {
      rgba[i * 4] = 255;
      rgba[i * 4 + 1] = 255;
      rgba[i * 4 + 2] = 255;
      rgba[i * 4 + 3] = 255;
    }
  }
  return sharp(rgba, { raw: { width: mask.width, height: mask.height, channels: 4 } })
    .png()
    .toBuffer();
}

/** PNG (alpha opaque = objet) -> masque. Format attendu pour un masque corrigé. */
export async function pngToMask(buffer: Buffer): Promise<Mask> {
  const { data, info } = await sharp(buffer).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const mask = new Uint8Array(info.width * info.height);
  for (let i = 0; i < mask.length; i++) {
    mask[i] = data[i * 4 + 3] > 127 ? 1 : 0;
  }
  return { width: info.width, height: info.height, data: mask };
}
