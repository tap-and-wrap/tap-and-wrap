import { createHash, randomUUID } from 'node:crypto';
import { Readable } from 'node:stream';
import {
  S3Client, PutObjectCommand, HeadObjectCommand, GetObjectCommand,
  CopyObjectCommand, DeleteObjectCommand,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { boundedOperation } from './work-budget.js';

export const UPLOAD_MIME_TYPES = Object.freeze(['image/jpeg', 'image/png', 'image/webp']);
export const MAX_UPLOAD_BYTES = 10 * 1024 * 1024;
export const UPLOAD_URL_SECONDS = 300;
const INSPECTION_BYTES = 256 * 1024;
let testStorage;
let configuredStorage;

export function storageError(code = 'STORAGE_UNAVAILABLE', status = 503) {
  const error = new Error(code === 'INVALID_IMAGE' ? 'Select a valid JPEG, PNG or WebP image within the configured limits.' : 'Private upload storage is unavailable. Please try again later.');
  error.code = code;
  error.status = status;
  return error;
}

export function createR2Storage(settings = process.env) {
  if (settings.STORAGE_ENABLED !== 'true'
      || !/^[a-f0-9]{32}$/i.test(settings.R2_ACCOUNT_ID || '')
      || !settings.R2_ACCESS_KEY_ID || !settings.R2_SECRET_ACCESS_KEY
      || !/^[a-z0-9][a-z0-9.-]{1,61}[a-z0-9]$/.test(settings.R2_BUCKET || '')) {
    throw storageError();
  }
  const bucket = settings.R2_BUCKET;
  const client = new S3Client({
    region: 'auto', endpoint: `https://${settings.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
    credentials: { accessKeyId: settings.R2_ACCESS_KEY_ID, secretAccessKey: settings.R2_SECRET_ACCESS_KEY },
    requestChecksumCalculation: 'WHEN_REQUIRED', responseChecksumValidation: 'WHEN_REQUIRED',
    maxAttempts: 2,
  });
  const send = (command, signal) => client.send(command, { abortSignal: signal ? AbortSignal.any([signal, AbortSignal.timeout(15000)]) : AbortSignal.timeout(15000) });
  return {
    async signPut(key, { mimeType, sizeBytes }) {
      const command = new PutObjectCommand({ Bucket: bucket, Key: key, ContentType: mimeType, ContentLength: sizeBytes });
      const url = await getSignedUrl(client, command, {
        expiresIn: UPLOAD_URL_SECONDS, signableHeaders: new Set(['content-type', 'content-length']),
      });
      return { url, headers: { 'Content-Type': mimeType }, expiresInSeconds: UPLOAD_URL_SECONDS };
    },
    async head(key, { signal } = {}) {
      const result = await send(new HeadObjectCommand({ Bucket: bucket, Key: key }), signal);
      return { sizeBytes: Number(result.ContentLength), mimeType: result.ContentType, etag: result.ETag };
    },
    async readPrefix(key, { signal } = {}) {
      const result = await send(new GetObjectCommand({ Bucket: bucket, Key: key, Range: `bytes=0-${INSPECTION_BYTES - 1}` }), signal);
      const body = boundPrivateBody(result.Body, { signal, timeoutMs: 15000 });
      const chunks = [];
      let length = 0;
      for await (const chunk of body) {
        length += chunk.length;
        if (length > INSPECTION_BYTES) {
          result.Body.destroy?.();
          throw storageError('INVALID_IMAGE', 400);
        }
        chunks.push(chunk);
      }
      return Buffer.concat(chunks);
    },
    async copy(source, destination, { mimeType, etag, signal }) {
      const encodedSource = `${bucket}/${source.split('/').map(encodeURIComponent).join('/')}`;
      await send(new CopyObjectCommand({
        Bucket: bucket, Key: destination, CopySource: encodedSource, CopySourceIfMatch: etag,
        ContentType: mimeType, MetadataDirective: 'REPLACE', Metadata: { verified: '1' },
      }), signal);
    },
    async remove(key, { signal } = {}) { await send(new DeleteObjectCommand({ Bucket: bucket, Key: key }), signal); },
    async open(key, { signal } = {}) {
      const result = await send(new GetObjectCommand({ Bucket: bucket, Key: key }), signal);
      return { body: result.Body, sizeBytes: Number(result.ContentLength), mimeType: result.ContentType };
    },
  };
}

/** Header timeouts do not bound S3 body consumption. Destroy stalled or
 * abandoned private streams without leaking SDK errors to the caller. */
export function boundPrivateBody(body, { signal, timeoutMs = 30000 } = {}) {
  if (!body || typeof body.destroy !== 'function' || !Number.isInteger(timeoutMs) || timeoutMs < 1 || timeoutMs > 60000) throw storageError();
  const stop = () => body.destroy(storageError('STORAGE_STREAM_INTERRUPTED'));
  const timer = setTimeout(stop, timeoutMs);
  timer.unref?.();
  const clear = () => { clearTimeout(timer); signal?.removeEventListener('abort', stop); };
  // Some callers abandon a received body before pipeline attaches its handler.
  body.once('error', () => {});
  body.once('close', clear); body.once('end', clear);
  if (signal?.aborted) stop();
  else signal?.addEventListener('abort', stop, { once: true });
  return body;
}

export function getStorage() {
  if (process.env.NODE_ENV === 'test') {
    if (testStorage) return testStorage;
    throw storageError('TEST_STORAGE_NOT_CONFIGURED');
  }
  configuredStorage ||= createR2Storage();
  return configuredStorage;
}

export function setStorageForTests(adapter) {
  if (process.env.NODE_ENV !== 'test') throw storageError('TEST_STORAGE_FORBIDDEN');
  testStorage = adapter || undefined;
}

export function privateObjectKey(prefix = 'temporary') {
  if (!['temporary', 'verified'].includes(prefix)) throw storageError('INVALID_STORAGE_PREFIX', 400);
  return `${prefix}/commerce/${randomUUID()}`;
}

export function imageDimensions(bytes, mimeType) {
  let width;
  let height;
  if (mimeType === 'image/png') {
    if (bytes.length < 33 || bytes.subarray(0, 8).toString('hex') !== '89504e470d0a1a0a'
        || bytes.readUInt32BE(8) !== 13 || bytes.subarray(12, 16).toString('ascii') !== 'IHDR') throw storageError('INVALID_IMAGE', 400);
    width = bytes.readUInt32BE(16);
    height = bytes.readUInt32BE(20);
  } else if (mimeType === 'image/jpeg') {
    if (bytes.length < 4 || bytes[0] !== 0xff || bytes[1] !== 0xd8) throw storageError('INVALID_IMAGE', 400);
    let offset = 2;
    while (offset + 4 <= bytes.length) {
      if (bytes[offset] !== 0xff) throw storageError('INVALID_IMAGE', 400);
      while (bytes[offset] === 0xff) offset += 1;
      const marker = bytes[offset++];
      if (marker === 0xd9 || marker === 0xda) break;
      if (marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) continue;
      if (offset + 2 > bytes.length) break;
      const segmentLength = bytes.readUInt16BE(offset);
      if (segmentLength < 2 || offset + segmentLength > bytes.length) break;
      if ([0xc0, 0xc1, 0xc2, 0xc3, 0xc5, 0xc6, 0xc7, 0xc9, 0xca, 0xcb, 0xcd, 0xce, 0xcf].includes(marker)) {
        if (segmentLength < 8) break;
        height = bytes.readUInt16BE(offset + 3);
        width = bytes.readUInt16BE(offset + 5);
        break;
      }
      offset += segmentLength;
    }
  } else if (mimeType === 'image/webp') {
    if (bytes.length < 30 || bytes.subarray(0, 4).toString('ascii') !== 'RIFF'
        || bytes.subarray(8, 12).toString('ascii') !== 'WEBP') throw storageError('INVALID_IMAGE', 400);
    const chunk = bytes.subarray(12, 16).toString('ascii');
    if (chunk === 'VP8X') {
      width = 1 + bytes.readUIntLE(24, 3);
      height = 1 + bytes.readUIntLE(27, 3);
    } else if (chunk === 'VP8 ' && bytes.subarray(23, 26).toString('hex') === '9d012a') {
      width = bytes.readUInt16LE(26) & 0x3fff;
      height = bytes.readUInt16LE(28) & 0x3fff;
    } else if (chunk === 'VP8L' && bytes[20] === 0x2f) {
      const packed = bytes.readUInt32LE(21);
      width = (packed & 0x3fff) + 1;
      height = ((packed >>> 14) & 0x3fff) + 1;
    }
  }
  if (!Number.isInteger(width) || !Number.isInteger(height) || width < 1 || height < 1
      || width > 12000 || height > 12000 || width * height > 40000000) throw storageError('INVALID_IMAGE', 400);
  return { width, height };
}

export async function inspectStoredImage(storage, key, expected, { budget } = {}) {
  const metadata = await boundedOperation(signal => storage.head(key, { signal }), { budget, code: 'STORAGE_INSPECTION_TIMEOUT' });
  if (!Number.isSafeInteger(metadata.sizeBytes) || metadata.sizeBytes !== expected.sizeBytes
      || metadata.sizeBytes > MAX_UPLOAD_BYTES || metadata.mimeType !== expected.mimeType || !metadata.etag) {
    throw storageError('INVALID_IMAGE', 400);
  }
  const bytes = await boundedOperation(signal => storage.readPrefix(key, { signal }), { budget, code: 'STORAGE_INSPECTION_TIMEOUT' });
  return { ...imageDimensions(bytes, expected.mimeType), etag: metadata.etag };
}

// The mock is deliberately unavailable outside the isolated test process.
export function createMemoryStorage() {
  if (process.env.NODE_ENV !== 'test') throw storageError('TEST_STORAGE_FORBIDDEN');
  const objects = new Map();
  return {
    objects,
    put(key, bytes, mimeType = 'image/png') {
      objects.set(key, { bytes: Buffer.from(bytes), mimeType });
    },
    async signPut(key, { mimeType }) {
      return { url: `https://storage.invalid/${encodeURIComponent(key)}`, headers: { 'Content-Type': mimeType }, expiresInSeconds: UPLOAD_URL_SECONDS };
    },
    async head(key) {
      const object = objects.get(key);
      if (!object) throw storageError('OBJECT_NOT_FOUND', 400);
      return { sizeBytes: object.bytes.length, mimeType: object.mimeType, etag: createHash('sha256').update(object.bytes).digest('hex') };
    },
    async readPrefix(key) {
      const object = objects.get(key);
      if (!object) throw storageError('OBJECT_NOT_FOUND', 400);
      return object.bytes.subarray(0, INSPECTION_BYTES);
    },
    async copy(source, destination, { etag }) {
      const metadata = await this.head(source);
      if (metadata.etag !== etag) throw storageError('OBJECT_CHANGED', 409);
      const object = objects.get(source);
      objects.set(destination, { bytes: Buffer.from(object.bytes), mimeType: object.mimeType });
    },
    async remove(key) { objects.delete(key); },
    async open(key) {
      const object = objects.get(key);
      if (!object) throw storageError('OBJECT_NOT_FOUND', 404);
      return { body: Readable.from(object.bytes), sizeBytes: object.bytes.length, mimeType: object.mimeType };
    },
  };
}
