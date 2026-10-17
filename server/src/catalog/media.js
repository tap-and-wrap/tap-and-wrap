import { CatalogMedia } from '../models/CatalogMedia.js';
import { isSafeImageReference } from './fields.js';
import { mediaError } from './media-storage.js';

// Existing imported paths are unchanged. Newly generated paths need a verified receipt.
export async function validateMediaReferences(keys, { session } = {}) {
  const distinct = [...new Set(keys.filter(Boolean))];
  if (distinct.some(key => !isSafeImageReference(key))) throw mediaError('Use verified catalog images.', 400);
  const managed = distinct.filter(key => key.startsWith('catalog-media/'));
  if (!managed.length) return;
  const count = await CatalogMedia.countDocuments({ key: { $in: managed } }).session(session || null).maxTimeMS(3000);
  if (count !== managed.length) throw mediaError('An image has not finished uploading. Retry its upload before saving.', 400);
}
