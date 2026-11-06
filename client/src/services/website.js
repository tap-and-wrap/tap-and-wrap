import { api, safePost, safePatch } from './api.js';

const read = async (path, params, signal) => (await api.get(path, { params, signal })).data.data;
export const getSiteContent = (signal) => read('/public/site-content', undefined, signal);
export const getWebsiteAdmin = (section, params, signal) => read(`/admin/website/${section}`, params, signal);
export const saveWebsiteCategory = async (id, payload) => (await (id ? safePatch(`/admin/categories/${encodeURIComponent(id)}`, payload) : safePost('/admin/categories', payload))).data.data;
export const saveHomepageProduct = async (id, payload) => (await safePatch(`/admin/products/${encodeURIComponent(id)}`, payload)).data.data;
