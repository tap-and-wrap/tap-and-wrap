import axios from 'axios';

export const api = axios.create({
  baseURL: import.meta.env.VITE_API_BASE_URL || 'http://localhost:4000/api/v1',
  withCredentials: true,
  timeout: 15000,
});

let csrfToken = null;
export async function getCsrfToken() {
  if (!csrfToken) {
    const response = await api.get('/auth/csrf');
    csrfToken = response.data.data.csrfToken;
  }
  return csrfToken;
}
export async function safePost(url, payload) {
  const token = await getCsrfToken();
  return api.post(url, payload, { headers: { 'x-csrf-token': token } });
}
export async function safePatch(url, payload) {
  const token = await getCsrfToken();
  return api.patch(url, payload, { headers: { 'x-csrf-token': token } });
}
