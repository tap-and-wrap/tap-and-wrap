import { api, getCsrfToken, safePatch, safePost } from '../services/api';

const body = (response) => response.data?.data ?? response.data;
export const commerceGet = async (path, params, signal) => body(await api.get(`/commerce${path}`, { params, signal }));
export const commercePost = async (path, payload) => body(await safePost(`/commerce${path}`, payload));
export const commercePatch = async (path, payload) => body(await safePatch(`/commerce${path}`, payload));
export const commerceDelete = async (path) => body(await api.delete(`/commerce${path}`, { headers: { 'x-csrf-token': await getCsrfToken() } }));
export const adminCommerceGet = async (path, params, signal) => body(await api.get(`/admin/commerce${path}`, { params, signal }));
export const adminCommercePost = async (path, payload) => body(await safePost(`/admin/commerce${path}`, payload));
export const adminCommercePatch = async (path, payload) => body(await safePatch(`/admin/commerce${path}`, payload));
export const adminCommerceDelete = async (path) => body(await api.delete(`/admin/commerce${path}`, { headers: { 'x-csrf-token': await getCsrfToken() } }));

export function commerceError(error) {
  return error?.response?.data?.error?.message || error?.response?.data?.message || (!error?.isAxiosError && error?.message) || 'This request could not be completed. Please try again.';
}

export function money(piastres) {
  if (!Number.isSafeInteger(piastres)) return 'Price awaiting approval';
  return new Intl.NumberFormat('en-EG', { style: 'currency', currency: 'EGP', maximumFractionDigits: 2 }).format(piastres / 100);
}

/** The file stays in browser memory until this function is explicitly called. */
export async function uploadPrivateFile(file, { purpose, productId, fieldKey, checkoutKey, templateId, templateVersion }, uploadedIds = []) {
  const signed = await commercePost('/uploads/sign', {
    purpose, productId, fieldKey, checkoutKey, templateId, templateVersion, mimeType: file.type, sizeBytes: file.size,
  });
  if (!signed.upload?.id || !signed.uploadUrl) throw new Error('Private storage is unavailable. Your file has not been uploaded.');
  uploadedIds.push(signed.upload.id);
  const result = await fetch(signed.uploadUrl, { method: 'PUT', headers: signed.headers || { 'Content-Type': file.type }, body: file, credentials: 'omit' });
  if (!result.ok) throw new Error('The file upload failed. Please try again.');
  await commercePost(`/uploads/${signed.upload.id}/complete`, {});
  return signed.upload.id;
}

export async function discardUploads(ids) {
  await Promise.allSettled(ids.map((id) => commerceDelete(`/uploads/${id}`)));
}

export async function uploadConfiguredFields(values, fields, { productId, purpose = 'personalization', templateId, templateVersion }, uploadedIds) {
  const result = {};
  for (const field of fields || []) {
    const value = values[field.key];
    if (field.type === 'image') {
      result[field.key] = [];
      for (const file of value || []) {
        result[field.key].push(await uploadPrivateFile(file, { purpose, productId, fieldKey: field.key, templateId, templateVersion }, uploadedIds));
      }
    } else if (typeof value === 'string') result[field.key] = value;
  }
  return result;
}

export async function getPrivateAdminFile(path) {
  const response = await api.get(`/admin/commerce${path}`, { responseType: 'blob', timeout: 15000 });
  return { blob: response.data, mimeType: response.data.type };
}
