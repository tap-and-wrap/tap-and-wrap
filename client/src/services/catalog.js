import { api, safePost, safePatch } from './api.js';

async function get(path, params, signal) {
  try {
    const response = await api.get(path, { params, signal });
    return response.data.data;
  } catch (error) {
    if (error.code === 'ERR_CANCELED' || !path.startsWith('/public/')) throw error;
    const publicError = new Error(error.response?.status === 404 ? 'This product or category is not available.' : 'Please try again in a moment.');
    publicError.status = error.response?.status;
    throw publicError;
  }
}
export const listProducts = (params = {}, signal) => get('/public/products', { ...params, limit: Math.min(params.limit ?? 20, 20) }, signal);
export const getProduct = (slug, signal) => get(`/public/products/${encodeURIComponent(slug)}`, undefined, signal);
export const listCategories = (params = {}, signal) => get('/public/categories', { ...params, limit: Math.min(params.limit ?? 20, 20) }, signal);
export const listAdminProducts = (params = {}, signal) => get('/admin/products', { ...params, limit: Math.min(params.limit ?? 20, 20) }, signal);
export const getAdminProduct = (id, signal) => get(`/admin/products/${encodeURIComponent(id)}`, undefined, signal);
export const getAdminProductPreview = (id, signal) => get(`/admin/products/${encodeURIComponent(id)}/preview`, undefined, signal);
export const listAdminCategories = (params = {}, signal) => get('/admin/categories', { ...params, limit: Math.min(params.limit ?? 20, 20) }, signal);
export const getCurrentUser = signal => get('/auth/me', undefined, signal);
export const verifyAdmin = signal => get('/admin/ping', undefined, signal);
export async function saveAdminProduct(id, payload) {
  const response = id ? await safePatch(`/admin/products/${encodeURIComponent(id)}`, payload) : await safePost('/admin/products', payload);
  return response.data.data;
}
