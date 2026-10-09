import { publicImageUrl } from './metadata.js';

export const MEDIA_VERIFICATION_SOURCE = 'authorized-media-object-verification';
const HASH = /^[a-f0-9]{64}$/;
const IMAGE_TYPES = new Set(['image/webp', 'image/jpeg', 'image/png', 'image/avif']);

// An HTTPS URL is only an address. This contract records a separately authorized
// object read/checksum check; neither this module nor normal builds contact R2.
export function verifiedMediaEntries(manifest, allowedOrigins, now = new Date()) {
  const result = new Map();
  const current = new Date(now).valueOf();
  if (!Number.isFinite(current)) return result;
  if (manifest?.version !== 1 || manifest.source !== MEDIA_VERIFICATION_SOURCE || !Array.isArray(manifest.objects) || manifest.objects.length > 10_000) return result;
  for (const object of manifest.objects) {
    const url = publicImageUrl(object?.url, allowedOrigins);
    const verifiedAt = Date.parse(object?.verifiedAt);
    const validUntil = Date.parse(object?.validUntil);
    if (!url || object.approved !== true || !HASH.test(object.sha256 || '') || !IMAGE_TYPES.has(object.contentType) || !Number.isSafeInteger(object.sizeBytes) || object.sizeBytes <= 0 || object.sizeBytes > 20 * 1024 * 1024 || !Number.isSafeInteger(object.width) || !Number.isSafeInteger(object.height) || object.width <= 0 || object.height <= 0 || object.width > 20_000 || object.height > 20_000 || !Number.isFinite(verifiedAt) || !Number.isFinite(validUntil) || verifiedAt > current || validUntil <= current || validUntil <= verifiedAt || typeof object.objectVersion !== 'string' || !/^[a-zA-Z0-9._:-]{1,200}$/.test(object.objectVersion)) continue;
    // Duplicated or contradictory assertions must never be silently selected.
    if (result.has(url)) { result.set(url, null); continue; }
    result.set(url, { url, sha256: object.sha256, contentType: object.contentType, sizeBytes: object.sizeBytes, width: object.width, height: object.height, objectVersion: object.objectVersion, verifiedAt: new Date(verifiedAt).toISOString(), validUntil: new Date(validUntil).toISOString(), approved: true });
  }
  return result;
}
