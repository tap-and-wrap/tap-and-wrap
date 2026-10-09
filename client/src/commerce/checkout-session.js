// Only an opaque idempotency key and uncertainty marker are persisted. Never
// store delivery details, payment proofs, or another owner's request payload.
const sessions = new Map();
const validKey = value => typeof value === 'string' && /^[a-f\d]{8}-[a-f\d]{4}-4[a-f\d]{3}-[89ab][a-f\d]{3}-[a-f\d]{12}$/i.test(value);
const storageKey = owner => `tw-checkout:${owner.startsWith('user:') ? owner.replace(/:\d+$/, '') : owner}`;
export function checkoutSession(owner) {
  const key = storageKey(owner);
  if (sessions.has(key)) return sessions.get(key);
  let stored;
  try { stored = JSON.parse(sessionStorage.getItem(key)); } catch { /* Restricted browser storage: use memory. */ }
  const value = validKey(stored?.key) ? { key: stored.key, pending: stored.pending === true } : { key: crypto.randomUUID(), pending: false };
  sessions.set(key, value);
  return value;
}
export function markCheckoutPending(owner) {
  const value = checkoutSession(owner);
  value.pending = true;
  try { sessionStorage.setItem(storageKey(owner), JSON.stringify(value)); } catch { /* The mounted retry key remains stable. */ }
  return value.key;
}
export function markCheckoutRejected(owner) {
  const value = checkoutSession(owner);
  value.pending = false;
  try { sessionStorage.setItem(storageKey(owner), JSON.stringify(value)); } catch { /* Keep the same proof-bound key in memory. */ }
}
export function clearCheckoutSession(owner) {
  sessions.delete(storageKey(owner));
  try { sessionStorage.removeItem(storageKey(owner)); } catch { /* Confirmation must never fail because storage is unavailable. */ }
}
