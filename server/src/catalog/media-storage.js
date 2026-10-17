import { createHash } from 'node:crypto';
import { S3Client, PutObjectCommand, GetObjectCommand } from '@aws-sdk/client-s3';
import { boundPrivateBody, UPLOAD_MIME_TYPES } from '../commerce/storage.js';
import { verifyImageIntegrity } from '../media/image-integrity.js';
import { mediaUrlForKey } from './public-presentation.js';
import { isSafeImageReference } from './fields.js';

export const CATALOG_IMAGE_MAX_BYTES = 10 * 1024 * 1024;
let testStorage, configured;
export const mediaError = (message = 'Catalog image storage is unavailable. Please retry later.', status = 503) => Object.assign(new Error(message), { status, code: status === 400 ? 'INVALID_CATALOG_IMAGE' : 'CATALOG_MEDIA_UNAVAILABLE' });
export const sha256 = bytes => createHash('sha256').update(bytes).digest('hex');

export async function validateCatalogImage(bytes, mimeType) {
  if (!Buffer.isBuffer(bytes) || !bytes.length || bytes.length > CATALOG_IMAGE_MAX_BYTES || !UPLOAD_MIME_TYPES.includes(mimeType)) throw mediaError('Use a JPEG, PNG or WebP image up to 10 MB.', 400);
  let dimensions;
  try { dimensions = await verifyImageIntegrity(bytes, mimeType); } catch (error) { if (error.status === 503) throw error; throw mediaError(error.message, 400); }
  // Reject incomplete containers as well as misleading MIME declarations.
  if (mimeType === 'image/jpeg' && bytes.subarray(-2).toString('hex') !== 'ffd9') throw mediaError('The JPEG is incomplete.', 400);
  if (mimeType === 'image/webp' && bytes.readUInt32LE(4) + 8 !== bytes.length) throw mediaError('The WebP is incomplete.', 400);
  if (mimeType === 'image/png') {
    let offset = 8, data = false, ended = false;
    while (offset + 12 <= bytes.length) {
      const size = bytes.readUInt32BE(offset), type = bytes.subarray(offset + 4, offset + 8).toString('ascii');
      if (offset + size + 12 > bytes.length) break;
      if (type === 'IDAT' && size > 0) data = true;
      offset += size + 12;
      if (type === 'IEND' && size === 0) { ended = offset === bytes.length; break; }
    }
    if (!data || !ended) throw mediaError('The PNG is incomplete.', 400);
  }
  return dimensions;
}

// Separate credentials and bucket from private commerce uploads; no browser PUT capability.
export function createCatalogStorage(settings = process.env, { transport } = {}) {
  if (transport && process.env.NODE_ENV !== 'test') throw mediaError();
  if (settings.CATALOG_MEDIA_UPLOADS_ENABLED !== 'true' || !/^[a-f0-9]{32}$/i.test(settings.CATALOG_R2_ACCOUNT_ID || '')
    || !settings.CATALOG_R2_ACCESS_KEY_ID || !settings.CATALOG_R2_SECRET_ACCESS_KEY
    || !/^[a-z0-9][a-z0-9.-]{1,61}[a-z0-9]$/.test(settings.CATALOG_R2_BUCKET || '')
    || settings.CATALOG_R2_BUCKET === settings.R2_BUCKET || !mediaUrlForKey('catalog-media/check.png', settings.CATALOG_MEDIA_BASE_URL)) throw mediaError();
  const bucket = settings.CATALOG_R2_BUCKET;
  const prefix = decodeURIComponent(new URL(settings.CATALOG_MEDIA_BASE_URL).pathname).replace(/^\/+|\/+$/g, '');
  if (prefix && !isSafeImageReference(`${prefix}/check.png`)) throw mediaError();
  const objectKey = key => prefix ? `${prefix}/${key}` : key;
  const client = new S3Client({ region: 'auto', endpoint: `https://${settings.CATALOG_R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
    credentials: { accessKeyId: settings.CATALOG_R2_ACCESS_KEY_ID, secretAccessKey: settings.CATALOG_R2_SECRET_ACCESS_KEY },
    requestChecksumCalculation: 'WHEN_REQUIRED', responseChecksumValidation: 'WHEN_REQUIRED', maxAttempts: 2 });
  const send = command => transport ? transport(command) : client.send(command, { abortSignal: AbortSignal.timeout(15000) });
  return {
    async put(key, bytes, mimeType) {
      try {
        await send(new PutObjectCommand({ Bucket: bucket, Key: objectKey(key), Body: bytes, ContentLength: bytes.length, ContentType: mimeType,
          CacheControl: 'public, max-age=31536000, immutable', IfNoneMatch: '*' }));
      } catch (error) { if (error?.$metadata?.httpStatusCode !== 412) throw error; }
    },
    async read(key) {
      const result = await send(new GetObjectCommand({ Bucket: bucket, Key: objectKey(key) }));
      const body = boundPrivateBody(result.Body, { timeoutMs: 15000 });
      const chunks = []; let size = 0;
      for await (const chunk of body) {
        size += chunk.length;
        if (size > CATALOG_IMAGE_MAX_BYTES) { body.destroy(); throw mediaError(); }
        chunks.push(chunk);
      }
      return { bytes: Buffer.concat(chunks), mimeType: result.ContentType };
    },
  };
}
export function getCatalogStorage() {
  if (process.env.NODE_ENV === 'test') { if (!testStorage) throw mediaError(); return testStorage; }
  return configured ||= createCatalogStorage();
}
export function setCatalogStorageForTests(storage) {
  if (process.env.NODE_ENV !== 'test') throw mediaError();
  testStorage = storage;
}

export async function storeCatalogImage(bytes, mimeType, storage = getCatalogStorage()) {
  const dimensions = await validateCatalogImage(bytes, mimeType), digest = sha256(bytes);
  const key = `catalog-media/v1/${digest}.${{ 'image/png': 'png', 'image/jpeg': 'jpg', 'image/webp': 'webp' }[mimeType]}`;
  try {
    await storage.put(key, bytes, mimeType);
    const verified = await storage.read(key);
    if (verified.mimeType !== mimeType || !Buffer.isBuffer(verified.bytes) || sha256(verified.bytes) !== digest) throw mediaError();
  } catch { throw mediaError(); }
  return { key, sha256: digest, mimeType, sizeBytes: bytes.length, ...dimensions };
}
