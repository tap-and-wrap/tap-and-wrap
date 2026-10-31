// Offline-first integrity checker for a NEW isolated Gift Box R2 prefix.
// Imports no runtime database configuration or network provider.
import { createHash } from 'node:crypto';
import { lstat, readFile, realpath } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { GIFT_BOX_MEDIA } from '../../../shared/gift-box/public-media.v1.mjs';

export const MEDIA_ROOT = fileURLToPath(new URL('../../../client/.gift-box-assets/', import.meta.url));
const SHA = /^[0-9a-f]{64}$/;
const SOURCE = /^(?:2026-10-28\.2\/webp-v1\/(?:320|640|1200)\/(?:boxes|flowers|toys|chocolate)\/[a-z0-9-]+\.webp|ribbon-bows-v1\/ribbon-[a-z0-9-]+-bow\.webp|box1-alpha-rgb-2026-10-31\.1\/1200\/boxes\/box-1-open-top\.webp)$/;
const sha256 = bytes => createHash('sha256').update(bytes).digest('hex');
const mediaLine = e => [e.componentId,e.role,e.width,e.source,e.key,e.bytes,e.sha256].join('\t');
function check(ok, reason) { if (!ok) throw new Error(`GIFTBOX_MEDIA_${reason}`); }

export function validateGiftBoxPublicManifest(manifest = GIFT_BOX_MEDIA) {
  check(manifest.schemaVersion === 1 && manifest.releaseId === 'gift-box-media-2026-10-31.1'
    && manifest.bucket === 'tapandwrap-catalog' && manifest.prefix === `gift-box/${manifest.releaseId}/`
    && manifest.status === 'prepared-not-uploaded' && Array.isArray(manifest.entries)
    && manifest.entries.length === 137 && manifest.counts?.ordinary === 115
    && manifest.counts?.bows === 21 && manifest.counts?.correctedBox1 === 1, 'MANIFEST_IDENTITY_INVALID');
  const paths = new Set(), slots = new Set();
  let ordinary = 0, bows = 0, overlay = 0;
  for (const e of manifest.entries) {
    const allowed = typeof e.source === 'string' && SOURCE.test(e.source);
    check(allowed && typeof e.key === 'string' && e.key.startsWith(manifest.prefix)
      && /^gift-box\/gift-box-media-2026-10-31\.1\/(?:standard\/(?:320|640|1200)\/(?:boxes|flowers|toys|chocolate)|bows|corrected-box1\/1200\/boxes)\/[a-z0-9-]+\.webp$/.test(e.key)
      && /^\w[\w-]*$/.test(e.componentId) && ['selection','placement','bow'].includes(e.role)
      && Number.isInteger(e.width) && [320,640,1200,1600].includes(e.width)
      && Number.isSafeInteger(e.bytes) && e.bytes > 0 && e.bytes <= 10485760
      && SHA.test(e.sha256), 'ENTRY_INVALID');
    const slot = `${e.componentId}:${e.role}:${e.width}`;
    check(!paths.has(e.key) && !slots.has(slot), 'DUPLICATE_KEY_OR_SLOT');
    paths.add(e.key); slots.add(slot);
    if (e.source.startsWith('2026-10-28.2/')) {
      check(e.key === `${manifest.prefix}standard/${e.source.slice('2026-10-28.2/webp-v1/'.length)}`
        && e.width === Number(e.source.split('/')[2]), 'STANDARD_MAPPING_INVALID');
      ordinary++;
    } else if (e.source.startsWith('ribbon-bows-v1/')) {
      check(e.key === `${manifest.prefix}bows/${e.source.slice('ribbon-bows-v1/'.length)}`
        && e.width === 1600 && e.role === 'bow', 'BOW_MAPPING_INVALID');
      bows++;
    } else {
      check(e.componentId === 'box-1' && e.role === 'placement' && e.width === 1200
        && e.key === `${manifest.prefix}corrected-box1/1200/boxes/box-1-open-top.webp`, 'BOX1_MAPPING_INVALID');
      overlay++;
    }
  }
  check(ordinary === 115 && bows === 21 && overlay === 1, 'INVENTORY_CHANGED');
  check(sha256(Buffer.from(manifest.entries.map(mediaLine).join('\n'))) === manifest.entriesDigestSha256,
    'MANIFEST_DIGEST_CHANGED');
  return true;
}

async function verifyNoLinks(root, relative) {
  check(SOURCE.test(relative), 'SOURCE_PATH_INVALID');
  const base=path.resolve(root), file=path.resolve(base, ...relative.split('/'));
  check(file.startsWith(base + path.sep), 'SOURCE_OUTSIDE_ROOT');
  let cursor=file;
  while (true) {
    check(!(await lstat(cursor)).isSymbolicLink(), 'LINKED_PATH');
    const parent=path.dirname(cursor);
    if (parent === cursor) break;
    cursor=parent;
  }
  check(path.relative(file, await realpath(file)) === '', 'LINKED_ROOT');
  return file;
}

export async function verifyLocalGiftBoxMedia({ root = MEDIA_ROOT, manifest = GIFT_BOX_MEDIA } = {}) {
  validateGiftBoxPublicManifest(manifest);
  let totalBytes = 0;
  const files = [];
  for (const entry of manifest.entries) {
    const file = await verifyNoLinks(root, entry.source);
    const bytes = await readFile(file);
    check(bytes.length === entry.bytes && sha256(bytes) === entry.sha256,
      `SOURCE_HASH_MISMATCH_${entry.componentId}_${entry.role}`);
    check(bytes.subarray(0,4).toString() === 'RIFF' && bytes.subarray(8,12).toString() === 'WEBP',
      'SOURCE_FORMAT_NOT_WEBP');
    totalBytes += bytes.length;
    files.push({ ...entry, file });
  }
  return { mode: 'offline-verified-no-network', releaseId: manifest.releaseId, bucket:manifest.bucket,
    files:files.length, bytes:totalBytes, digest:manifest.entriesDigestSha256, writes:false, networkRequests:false,
    verifiedFiles:files };
}
