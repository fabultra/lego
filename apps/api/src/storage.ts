import { GetObjectCommand, PutObjectCommand, S3Client } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, join, normalize } from 'node:path';
import { config } from './config';

/**
 * Abstraction de stockage : disque local en dev, S3-compatible en prod.
 * Les clés sont de la forme "projects/<id>/source.jpg".
 */
export interface StorageDriver {
  put(key: string, data: Buffer, contentType: string): Promise<void>;
  get(key: string): Promise<Buffer>;
  /** URL lisible par le client mobile (route /files en local, URL signée en S3). */
  url(key: string): Promise<string>;
}

class LocalDiskStorage implements StorageDriver {
  constructor(private readonly root: string) {}

  private resolve(key: string): string {
    const p = normalize(join(this.root, key));
    if (!p.startsWith(normalize(this.root))) throw new Error('Clé de stockage invalide');
    return p;
  }

  async put(key: string, data: Buffer): Promise<void> {
    const p = this.resolve(key);
    await mkdir(dirname(p), { recursive: true });
    await writeFile(p, data);
  }

  async get(key: string): Promise<Buffer> {
    return readFile(this.resolve(key));
  }

  async url(key: string): Promise<string> {
    return `${config.publicBaseUrl}/files/${key}`;
  }
}

class S3Storage implements StorageDriver {
  private client: S3Client;
  constructor() {
    this.client = new S3Client({
      region: config.storage.s3.region,
      endpoint: config.storage.s3.endpoint,
      forcePathStyle: Boolean(config.storage.s3.endpoint), // MinIO
      credentials: {
        accessKeyId: config.storage.s3.accessKey,
        secretAccessKey: config.storage.s3.secretKey,
      },
    });
  }

  async put(key: string, data: Buffer, contentType: string): Promise<void> {
    await this.client.send(
      new PutObjectCommand({
        Bucket: config.storage.s3.bucket,
        Key: key,
        Body: data,
        ContentType: contentType,
      }),
    );
  }

  async get(key: string): Promise<Buffer> {
    const res = await this.client.send(
      new GetObjectCommand({ Bucket: config.storage.s3.bucket, Key: key }),
    );
    return Buffer.from(await res.Body!.transformToByteArray());
  }

  async url(key: string): Promise<string> {
    return getSignedUrl(
      this.client,
      new GetObjectCommand({ Bucket: config.storage.s3.bucket, Key: key }),
      { expiresIn: 3600 },
    );
  }
}

export const storage: StorageDriver =
  config.storage.driver === 's3' ? new S3Storage() : new LocalDiskStorage(config.storage.localDir);

export const storageKeys = {
  source: (projectId: string) => `projects/${projectId}/source.jpg`,
  maskAuto: (projectId: string) => `projects/${projectId}/mask-auto.png`,
  maskEdited: (projectId: string) => `projects/${projectId}/mask-edited.png`,
  grid: (projectId: string) => `projects/${projectId}/grid.json`,
};
