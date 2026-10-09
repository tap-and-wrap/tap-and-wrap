import { api, assertAuthGeneration, authGeneration, safeDelete, safePatch, safePost } from '../services/api';
import { subscribeSession } from '../auth/session.js';

const body = (response) => response.data?.data ?? response.data;
export const commerceGet = async (path, params, signal) => body(await api.get(`/commerce${path}`, { params, signal }));
export const commercePost = async (path, payload, options) => body(await safePost(`/commerce${path}`, payload, options));
export const commercePatch = async (path, payload) => body(await safePatch(`/commerce${path}`, payload));
export const commerceDelete = async (path) => body(await safeDelete(`/commerce${path}`));
export const adminCommerceGet = async (path, params, signal) => body(await api.get(`/admin/commerce${path}`, { params, signal }));
export const adminCommercePost = async (path, payload) => body(await safePost(`/admin/commerce${path}`, payload));
export const adminCommercePatch = async (path, payload) => body(await safePatch(`/admin/commerce${path}`, payload));
export const adminCommerceDelete = async (path) => body(await safeDelete(`/admin/commerce${path}`));

export function commerceError(error) {
  return error?.response?.data?.error?.message || error?.response?.data?.message || (!error?.isAxiosError && error?.message) || 'This request could not be completed. Please try again.';
}

export function money(piastres) {
  if (!Number.isSafeInteger(piastres)) return 'Price awaiting approval';
  return new Intl.NumberFormat('en-EG', { style: 'currency', currency: 'EGP', maximumFractionDigits: 2 }).format(piastres / 100);
}

/** The file stays in browser memory until this function is explicitly called. */
const uploadOwners = new WeakMap();
function uploadGeneration(uploadedIds, expected) {
  const generation = expected ?? uploadOwners.get(uploadedIds) ?? authGeneration();
  assertAuthGeneration(generation);
  uploadOwners.set(uploadedIds, generation);
  return generation;
}
export const PRIVATE_UPLOAD_TIMEOUT_MS = 60_000;
export async function uploadPrivateFile(file, { purpose, productId, fieldKey, checkoutKey, templateId, templateVersion, generation: expected, onProgress, signal }, uploadedIds = []) {
  const generation = uploadGeneration(uploadedIds, expected);
  onProgress?.('Preparing private upload…');
  const controller = new AbortController();
  const unsubscribe = subscribeSession(() => { if (authGeneration() !== generation) controller.abort(); });
  const abort = () => controller.abort();
  signal?.addEventListener('abort', abort, { once: true });
  if (signal?.aborted) abort();
  let timedOut = false;
  const timer = setTimeout(() => { timedOut = true; controller.abort(); }, PRIVATE_UPLOAD_TIMEOUT_MS);
  try {
    const signed = await commercePost('/uploads/sign', {
      purpose, productId, fieldKey, checkoutKey, templateId, templateVersion, mimeType: file.type, sizeBytes: file.size,
    }, { signal: controller.signal });
    assertAuthGeneration(generation);
    if (!signed.upload?.id || !signed.uploadUrl) throw new Error('Private storage is unavailable. Your file has not been uploaded.');
    uploadedIds.push(signed.upload.id);
    assertAuthGeneration(generation);
    onProgress?.('Uploading your selected file…');
    const result = await fetch(signed.uploadUrl, { method: 'PUT', headers: signed.headers || { 'Content-Type': file.type }, body: file, credentials: 'omit', signal: controller.signal });
    assertAuthGeneration(generation);
    if (!result.ok) throw new Error('The file upload failed. Please try again.');
    onProgress?.('Verifying private upload…');
    await commercePost(`/uploads/${signed.upload.id}/complete`, {}, { signal: controller.signal });
    assertAuthGeneration(generation);
    return signed.upload.id;
  } catch (error) {
    assertAuthGeneration(generation);
    if (timedOut) throw new Error('The private upload timed out. Your item was not added. Check your connection and try again.');
    throw error;
  } finally { clearTimeout(timer); unsubscribe(); signal?.removeEventListener('abort', abort); }
}

export async function discardUploads(ids) {
  // Files signed for a previous account expire through the existing worker;
  // cleanup must never issue private mutations using another account's cookie.
  if (uploadOwners.has(ids) && uploadOwners.get(ids) !== authGeneration()) return;
  await Promise.allSettled(ids.map((id) => commerceDelete(`/uploads/${id}`)));
}

export async function uploadConfiguredFields(values, fields, { productId, purpose = 'personalization', templateId, templateVersion, onProgress }, uploadedIds = []) {
  const generation = uploadGeneration(uploadedIds);
  if (new Set((fields || []).map((field) => field.key)).size !== (fields || []).length) {
    throw new Error('This configuration contains duplicate fields. Reload the product before adding it.');
  }
  const result = {};
  for (const field of fields || []) {
    assertAuthGeneration(generation);
    const value = values[field.key];
    if (field.type === 'image') {
      result[field.key] = [];
      for (const file of value || []) {
        result[field.key].push(await uploadPrivateFile(file, { purpose, productId, fieldKey: field.key, templateId, templateVersion, generation, onProgress }, uploadedIds));
        assertAuthGeneration(generation);
      }
    } else if (typeof value === 'string') result[field.key] = value;
  }
  assertAuthGeneration(generation);
  return result;
}

export async function getPrivateAdminFile(path) {
  const response = await api.get(`/admin/commerce${path}`, { responseType: 'blob', timeout: 15000 });
  return { blob: response.data, mimeType: response.data.type };
}
