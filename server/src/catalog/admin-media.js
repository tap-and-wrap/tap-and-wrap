import { createHash } from 'node:crypto';
import { isIP } from 'node:net';
import sharp from 'sharp';
import { S3Client, HeadObjectCommand, PutObjectCommand, ListObjectsV2Command } from '@aws-sdk/client-s3';
import { mediaUrlForKey } from './public-presentation.js';

const PREFIX = 'managed/v1/';
const FORMATS = new Map([['image/jpeg', 'jpeg'], ['image/png', 'png'], ['image/webp', 'webp']]);
const MAX_BYTES = 10 * 1024 * 1024;
const MAX_PIXELS = 20_000_000;
let client;
let busy = false;

function rejected(code, status = 400) {
  const error = new Error(code === 'MEDIA_DISABLED' ? 'Catalog uploads are not configured.' : 'Image could not be processed.');
  error.code = code; error.status = status;
  return error;
}
export function mediaConfig(settings = process.env) {
  if (settings.CATALOG_MEDIA_UPLOADS_ENABLED !== 'true') throw rejected('MEDIA_DISABLED', 503);
  const { CATALOG_R2_ACCOUNT_ID: account, CATALOG_R2_ACCESS_KEY_ID: key,
    CATALOG_R2_SECRET_ACCESS_KEY: secret, CATALOG_R2_BUCKET: bucket, CATALOG_MEDIA_BASE_URL: base } = settings;
  if (!/^[a-f0-9]{32}$/i.test(account || '') || !key || !secret || !/^[a-z0-9][a-z0-9.-]{1,61}[a-z0-9]$/.test(bucket || '')
    || bucket === settings.R2_BUCKET || !base) throw rejected('MEDIA_CONFIGURATION_INVALID', 503);
  const url = new URL(base);
  if (url.protocol !== 'https:' || url.username || url.password || url.search || url.hash || isIP(url.hostname) || url.pathname !== '/') {
    throw rejected('MEDIA_CONFIGURATION_INVALID', 503);
  }
  return { account, key, secret, bucket, base };
}
function storage(config) {
  if (!client) client = new S3Client({
    region: 'auto', endpoint: `https://${config.account}.r2.cloudflarestorage.com`,
    credentials: { accessKeyId: config.key, secretAccessKey: config.secret },
    requestChecksumCalculation: 'WHEN_REQUIRED', responseChecksumValidation: 'WHEN_REQUIRED', maxAttempts: 2,
  });
  return client;
}
function urlFor(key, config) { return mediaUrlForKey(key, config.base); }
export function responsiveKey(key, width) {
  if (typeof key !== 'string' || !/^managed\/v1\/(product|category)\/[a-f0-9]{64}\/(1600|1200|640|320)\.webp$/.test(key)) return null;
  const size = key.includes('/category/') ? 1200 : 1600;
  return key.replace(/\/(?:1600|1200|640|320)\.webp$/, `/${Math.min(width, size)}.webp`);
}
export function outputKeys(kind, digest) {
  if (!['product', 'category'].includes(kind) || !/^[a-f0-9]{64}$/.test(digest)) throw rejected('INVALID_MEDIA_REQUEST');
  const base = `${PREFIX}${kind}/${digest}/`;
  return { main: `${base}${kind === 'category' ? '1200' : '1600'}.webp`, card: `${base}640.webp`, thumb: `${base}320.webp` };
}
function orientationSize(meta) {
  const sideways = [5, 6, 7, 8].includes(meta.orientation);
  return { width: sideways ? meta.height : meta.width, height: sideways ? meta.width : meta.height };
}
export async function transformImage(input, { kind = 'product', focus = 'attention' } = {}) {
  if (!Buffer.isBuffer(input) || input.length < 24 || input.length > MAX_BYTES || !['product', 'category'].includes(kind)
    || !['attention', 'centre', 'north'].includes(focus)) throw rejected('INVALID_MEDIA_REQUEST');
  let meta;
  try { meta = await sharp(input, { failOn: 'error', limitInputPixels: MAX_PIXELS }).metadata(); }
  catch { throw rejected('INVALID_IMAGE'); }
  if (!['jpeg', 'png', 'webp'].includes(meta.format) || !meta.width || !meta.height || meta.width * meta.height > MAX_PIXELS
    || (meta.pages && meta.pages !== 1)) throw rejected('INVALID_IMAGE');
  const physical = orientationSize(meta);
  const maxCategoryWidth = Math.max(1, Math.floor(Math.min(1200, physical.width, physical.height * 4 / 3)));
  const outputs = [];
  for (const [label, width] of [['main', kind === 'category' ? 1200 : 1600], ['card', 640], ['thumb', 320]]) {
    const adjustedWidth = Math.max(1, Math.min(width, kind === 'category' ? maxCategoryWidth : physical.width));
    const resizing = kind === 'category' ? { width: adjustedWidth, height: Math.max(1, Math.round(adjustedWidth * 3 / 4)), fit: 'cover', position: focus === 'attention' ? sharp.strategy.attention : focus === 'north' ? 'north' : 'centre', withoutEnlargement: true }
      : { width: adjustedWidth, fit: 'inside', withoutEnlargement: true };
    let processed;
    try {
      processed = await sharp(input, { failOn: 'error', limitInputPixels: MAX_PIXELS }).rotate().resize(resizing)
        .webp({ quality: meta.hasAlpha ? 88 : 82, effort: 4 }).toBuffer();
    } catch { throw rejected('INVALID_IMAGE'); }
    outputs.push({ label, buffer: processed });
  }
  const digest = createHash('sha256').update(`catalog-v1:${kind}:${focus}:`).update(input).digest('hex');
  const keys = outputKeys(kind, digest);
  return { keys, outputs, originalBytes: input.length, optimizedBytes: outputs[0].buffer.length, kind, sourceFormat: meta.format };
}
async function putIfMissing(s3, bucket, key, buffer) {
  try { await s3.send(new HeadObjectCommand({ Bucket: bucket, Key: key })); return false; }
  catch (error) { if (error.$metadata?.httpStatusCode !== 404 && error.name !== 'NotFound' && error.name !== 'NoSuchKey') throw rejected('MEDIA_STORAGE_UNAVAILABLE', 503); }
  await s3.send(new PutObjectCommand({ Bucket: bucket, Key: key, Body: buffer, ContentType: 'image/webp', CacheControl: 'public, max-age=31536000, immutable' }));
  return true;
}
export async function saveAdminMedia(input, { kind, focus, mimeType }, settings = process.env) {
  if (busy) throw rejected('MEDIA_PROCESSOR_BUSY', 429);
  busy = true;
  try {
    const config = mediaConfig(settings);
    if (!FORMATS.has(mimeType) || !input?.length || input.length > MAX_BYTES) throw rejected('INVALID_MEDIA_REQUEST');
    const { keys, outputs, originalBytes, optimizedBytes, sourceFormat } = await transformImage(input, { kind, focus });
    if (sourceFormat !== FORMATS.get(mimeType)) throw rejected('INVALID_IMAGE');
    const s3 = storage(config);
    for (const { label, buffer } of outputs) await putIfMissing(s3, config.bucket, keys[label], buffer);
    return { key: keys.main, url: urlFor(keys.main, config), thumbnailUrl: urlFor(keys.thumb, config), cardUrl: urlFor(keys.card, config), originalBytes, optimizedBytes };
  } finally { busy = false; }
}
export async function listAdminMedia({ kind = 'product', cursor, limit = 20 } = {}, settings = process.env) {
  const config = mediaConfig(settings);
  if (!['product', 'category'].includes(kind) || !Number.isInteger(limit) || limit < 1 || limit > 30) throw rejected('INVALID_MEDIA_REQUEST');
  if (cursor && (typeof cursor !== 'string' || cursor.length > 3000)) throw rejected('INVALID_MEDIA_REQUEST');
  const result = await storage(config).send(new ListObjectsV2Command({
    Bucket: config.bucket, Prefix: `${PREFIX}${kind}/`, Delimiter: '/', MaxKeys: limit, ...(cursor ? { ContinuationToken: cursor } : {}),
  }));
  const images = (result.CommonPrefixes || []).map(record => {
    const prefix = record.Prefix;
    if (!new RegExp(`^${PREFIX}${kind}/[a-f0-9]{64}/$`).test(prefix)) return null;
    const keys = outputKeys(kind, prefix.split('/')[3]);
    return { key: keys.main, url: urlFor(keys.main, config), thumbnailUrl: urlFor(keys.thumb, config), cardUrl: urlFor(keys.card, config) };
  }).filter(Boolean);
  return { images, nextCursor: result.IsTruncated ? result.NextContinuationToken || null : null };
}
