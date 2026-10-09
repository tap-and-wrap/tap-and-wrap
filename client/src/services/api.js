import axios from 'axios';

export const api = axios.create({
  baseURL: import.meta.env.VITE_API_BASE_URL || 'http://localhost:4000/api/v1',
  withCredentials: true,
  timeout: 15000,
});

let csrfToken = null;
let csrfRequest = null;
let lifecycle = { generation: () => 0, unauthorized: () => {} };
export function setAuthLifecycle(value) { lifecycle = value; }
export const authGeneration = () => lifecycle.generation();
const privatePath = url => /^\/(?:admin|commerce)(?:\/|$)/.test(url || '') || /^\/auth\/(?:me|account-status|request-verification)$/.test(url || '');

api.interceptors.request.use(config => {
  if (privatePath(config.url)) config.authGeneration ??= authGeneration();
  assertCurrent(config);
  return config;
}, error => { throw error; }, { synchronous: true });
function assertCurrent(config) {
  if (config?.authGeneration !== undefined) assertAuthGeneration(config.authGeneration);
}
export function assertAuthGeneration(expected) {
  if (expected !== authGeneration()) throw new axios.CanceledError('Authentication changed. Previous private operation discarded.');
}
function observeExpiredSession(response) {
  const config = response?.config;
  // Optional authentication can successfully return a fresh guest response.
  // The previous account must lose its cached views immediately, even on 200.
  // Session probes and explicit logout already own that transition themselves.
  if (response?.headers?.['x-session-expired'] === '1' && !config?.sessionProbe && config?.url !== '/auth/logout') {
    lifecycle.unauthorized();
    throw new axios.CanceledError('The session expired. Previous account response discarded.');
  }
}
api.interceptors.response.use(response => {
  assertCurrent(response.config);
  observeExpiredSession(response);
  return response;
}, async error => {
  const config = error.config;
  assertCurrent(config);
  observeExpiredSession(error.response);
  // INVALID_CSRF is an explicit rejection before the protected mutation. Never
  // replay network failures, invalid Origin, authorization or uncertain orders.
  if (config && error.response?.status === 403 && error.response?.data?.error?.code === 'INVALID_CSRF' && !config.csrfRetried) {
    config.csrfRetried = true;
    if (csrfToken === config.headers?.['x-csrf-token']) csrfToken = null;
    const token = await getCsrfToken();
    assertCurrent(config);
    if (config.signal?.aborted) throw new axios.CanceledError();
    config.headers['x-csrf-token'] = token;
    return api.request(config);
  }
  if (error.response?.status === 401 && privatePath(config?.url) && !config?.sessionProbe) lifecycle.unauthorized();
  throw error;
});
export async function getCsrfToken() {
  if (csrfToken) return csrfToken;
  if (!csrfRequest) csrfRequest = api.get('/auth/csrf').then(response => {
    csrfToken = response.data.data.csrfToken;
    return csrfToken;
  }).finally(() => { csrfRequest = null; });
  return csrfRequest;
}
export async function safePost(url, payload, options = {}) {
  const generation = privatePath(url) ? authGeneration() : undefined;
  const token = await getCsrfToken();
  return api.post(url, payload, { ...options, authGeneration: generation, headers: { ...options.headers, 'x-csrf-token': token } });
}
export async function safePatch(url, payload, options = {}) {
  const generation = privatePath(url) ? authGeneration() : undefined;
  const token = await getCsrfToken();
  return api.patch(url, payload, { ...options, authGeneration: generation, headers: { ...options.headers, 'x-csrf-token': token } });
}
export async function safeDelete(url, options = {}) {
  const generation = privatePath(url) ? authGeneration() : undefined;
  const token = await getCsrfToken();
  return api.delete(url, { ...options, authGeneration: generation, headers: { ...options.headers, 'x-csrf-token': token } });
}
