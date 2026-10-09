import { api, safePost, setAuthLifecycle } from '../services/api.js';
import { scopeLegacyPrivateQueries } from './cache.js';

let snapshot = { generation: 0, phase: 'checking', user: null, error: null };
let cache;
let probe;
let broadcast = () => {};
const listeners = new Set();
export const sessionSnapshot = () => snapshot;
export const sessionOwner = (value = snapshot) => {
  const id = value.user?.id || value.user?._id;
  return `${id ? `user:${id}` : 'guest'}:${value.generation}`;
};
export const subscribeSession = listener => { listeners.add(listener); return () => listeners.delete(listener); };
export const privateQueryKey = (owner, ...parts) => ['private', owner, ...parts];
export const privateQuery = query => ['private', 'admin', 'account', 'commerce', 'session', 'auth'].includes(query.queryKey[0]);

function publish(value) {
  // Install the next owner's defaults before React can construct its queries.
  if (cache) scopeLegacyPrivateQueries(cache, sessionOwner(value));
  snapshot = value;
  for (const listener of listeners) listener();
}
function cancelPrivate() {
  if (!cache) return;
  void cache.cancelQueries({ predicate: privateQuery });
  cache.removeQueries({ predicate: privateQuery });
}
function reset(phase = 'checking') {
  const generation = snapshot.generation + 1;
  publish({ generation, phase, user: null, error: null });
  probe = null;
  cancelPrivate();
  return generation;
}
export function configureSession(queryClient, notify) {
  cache = queryClient;
  scopeLegacyPrivateQueries(cache, sessionOwner());
  broadcast = notify;
  setAuthLifecycle({ generation: () => snapshot.generation, unauthorized: () => {
    reset();
    void refreshSession();
  } });
}
export async function refreshSession() {
  if (probe) return probe;
  const generation = snapshot.generation;
  const request = cache.fetchQuery({ queryKey: ['session', 'user', generation], staleTime: 0, retry: false,
    queryFn: async ({ signal }) => (await api.get('/auth/me', { signal, sessionProbe: true })).data.data.user || null });
  probe = request.then(user => {
    if (generation !== snapshot.generation) return null;
    // A verification that observes a different cookie owner invalidates every
    // old owner query, including requests that ignored AbortSignal.
    const oldId = snapshot.user?.id || snapshot.user?._id;
    const newId = user?.id || user?._id;
    if (snapshot.phase === 'ready' && (oldId !== newId || snapshot.user?.role !== user?.role)) {
      reset('transition');
      publish({ generation: snapshot.generation, phase: 'ready', user, error: null });
    } else publish({ generation, phase: 'ready', user, error: null });
    return user;
  }).catch(error => {
    if (generation !== snapshot.generation) return null;
    // Losing a verified account is itself an authentication boundary. Abort
    // and invalidate its generation even when the failed request was /me.
    if (snapshot.user) reset();
    else cancelPrivate();
    if (error.response?.status === 401) {
      publish({ generation: snapshot.generation, phase: 'ready', user: null, error: null });
    } else publish({ generation: snapshot.generation, phase: 'error', user: null, error });
    return null;
  }).finally(() => { if (generation === snapshot.generation) probe = null; });
  return probe;
}
export async function changeAuthentication(path, payload) {
  if (snapshot.phase === 'transition') throw new Error('An account change is already in progress.');
  const generation = reset('transition');
  try {
    const response = await safePost(path, payload);
    // Set-Cookie can already have changed the shared browser even if another
    // tab superseded this request. Every completed auth response must announce
    // that change, rather than leaving other tabs bound to the previous owner.
    broadcast();
    if (generation !== snapshot.generation) throw new Error('The account changed in another window. Sign in again.');
    // Verify the cookie, rather than granting access from a login response alone.
    await refreshSession();
    if (generation !== snapshot.generation) throw new Error('The account changed in another window. Sign in again.');
    if (snapshot.phase === 'error' || ['/auth/login', '/auth/signup'].includes(path) && !snapshot.user) throw new Error('The account could not be verified. Please try signing in again.');
    return response;
  } catch (error) {
    // A network failure may occur after cookies were received. Verify only;
    // never replay the uncertain authentication mutation.
    if (!error.response || error.response.status < 400) broadcast();
    reset();
    await refreshSession();
    throw error;
  }
}
export function sessionChangedElsewhere() { reset(); void refreshSession(); }
