import { api, safePost, safePatch } from './api.js';

const read = async (path, params, signal) => (await api.get(path, { params, signal })).data.data;
export const getSiteContent = (signal) => read('/public/site-content', undefined, signal);
export const getProductReviews = (slug, page = 1, signal) => read(`/public/products/${encodeURIComponent(slug)}/reviews`, { page, limit: 20 }, signal);
export const getPublishedBundles = (signal) => read('/public/bundles', undefined, signal);
export const getWebsiteAdmin = (section, params, signal) => read(`/admin/website/${section}`, params, signal);
export const getWebsiteReview = (id, signal) => read(`/admin/website/reviews/${encodeURIComponent(id)}`, undefined, signal);
export const saveWebsiteContent = async (payload) => (await safePatch('/admin/website/content', payload)).data.data;
export const saveWebsiteReview = async (id, payload) => (await (id ? safePatch(`/admin/website/reviews/${encodeURIComponent(id)}`, payload) : safePost('/admin/website/reviews', payload))).data.data;
export const saveWebsiteCategory = async (id, payload) => (await (id ? safePatch(`/admin/categories/${encodeURIComponent(id)}`, payload) : safePost('/admin/categories', payload))).data.data;
export const saveHomepageProduct = async (id, payload) => (await safePatch(`/admin/products/${encodeURIComponent(id)}`, payload)).data.data;
