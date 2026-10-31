// Gift Box specific private upload handoff. Invoked only from an explicit
// customer submission action. Do not persist local Files, object URLs or
// filenames in the cart payload, localStorage or public telemetry.
import { getFixedComponent } from '../../../shared/gift-box/definitions.mjs';

const MAX_PRIVATE_IMAGE_BYTES = 8 * 1024 * 1024;
const ACCEPTED = new Set(['image/jpeg', 'image/png', 'image/webp']);
// Existing per-owner upload quota is 20 files; that is NOT a physical limit.
export const GIFT_BOX_PRIVATE_UPLOAD_BATCH_LIMIT = 20;

export function validateGiftBoxPhotoBatch(photos, boxId) {
  if (getFixedComponent(boxId)?.category !== 'box') throw new Error('Choose a gift box before uploading photos.');
  if (!Array.isArray(photos) || photos.length > GIFT_BOX_PRIVATE_UPLOAD_BATCH_LIMIT) {
    throw new Error('Up to 20 private files can be uploaded together. This is a storage limit, not a gift-box packing limit.');
  }
  const ids = new Set(), files = new Set();
  for (const photo of photos) {
    if (!photo || typeof photo.id !== 'string' || !/^[a-f0-9-]{36}$/i.test(photo.id)
        || !photo.file || !ACCEPTED.has(photo.file.type)
        || !Number.isSafeInteger(photo.file.size) || photo.file.size < 1 || photo.file.size > MAX_PRIVATE_IMAGE_BYTES
        || ids.has(photo.id) || files.has(photo.file)) {
      throw new Error('Choose distinct supported JPEG, PNG or WebP images (up to 8 MB each).');
    }
    ids.add(photo.id); files.add(photo.file);
  }
  return true;
}

// Only opaque verified Upload IDs may leave this helper. The existing upload
// client provides short-lived direct PUT, signature verification, owner-change
// cancellation and an object copy away from the temporary signed key.
export async function uploadGiftBoxPrivatePhotos({ photos, boxId, ownerKey, uploadFile, cache = new Map(), uploadedIds = [], onProgress }) {
  validateGiftBoxPhotoBatch(photos, boxId);
  if (typeof uploadFile !== 'function') throw new Error('Private storage is not configured.');
  if (typeof ownerKey !== 'string' || !ownerKey || ownerKey.length > 200) throw new Error('A current private shopping session is required.');
  const result = [];
  for (const photo of photos) {
    const cached = cache.get(photo.file);
    let id = cached?.boxId === boxId && cached?.ownerKey === ownerKey ? cached.id : null;
    if (!id) {
      id = await uploadFile(photo.file, {
        purpose: 'gift_box_photo', giftBoxId: boxId, onProgress,
      }, uploadedIds);
      if (typeof id !== 'string' || !/^[a-f0-9]{24}$/.test(id)) throw new Error('The private photo could not be verified.');
      cache.set(photo.file, { id, boxId, ownerKey });
    }
    result.push({ photoId: photo.id, uploadId: id });
  }
  return result;
}
