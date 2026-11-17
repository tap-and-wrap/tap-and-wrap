// Versioned, owner-scoped, local-only customization draft storage.
// Never copy files, object URLs, design text, keys or receipts into analytics,
// localStorage, URLs, or public commerce payloads. IndexedDB holds File/Blob
// structured-clones only on the customer's device.
const DB = 'tw-private-customization-drafts-v1';
const STORE = 'drafts';
const SCHEMA = 1;
const LIFE_MS = 7 * 24 * 60 * 60 * 1000;
const inFlight = new Map();
let opening;

function database() {
  if (typeof indexedDB === 'undefined') return Promise.reject(Error('Private browser storage is unavailable.'));
  if (!opening) opening = new Promise((resolve, reject) => {
    const req = indexedDB.open(DB, SCHEMA);
    req.onupgradeneeded = () => {
      if (!req.result.objectStoreNames.contains(STORE)) req.result.createObjectStore(STORE);
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error || Error('Private draft storage failed.'));
    req.onblocked = () => reject(Error('A second tab is blocking private draft storage.'));
  }).catch(error => { opening = null; throw error; });
  return opening;
}
function key(kind, owner) {
  if (!['gift-box', 'engraving', 'cart-preparations'].includes(kind) || typeof owner !== 'string' || !owner || owner.length > 220) {
    throw Error('A valid private customization owner is required.');
  }
  return `${kind}:${owner}`;
}
async function transact(action, storeKey, value) {
  const db = await database();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, action === 'get' ? 'readonly' : 'readwrite');
    const store = tx.objectStore(STORE);
    let result;
    const req = action === 'get' ? store.get(storeKey) : action === 'delete' ? store.delete(storeKey) : store.put(value, storeKey);
    req.onsuccess = () => { result = req.result; };
    tx.oncomplete = () => resolve(result);
    tx.onerror = () => reject(tx.error || Error('Private draft storage transaction failed.'));
    tx.onabort = () => reject(tx.error || Error('Private draft storage was interrupted.'));
  });
}
function serial(storeKey, work) {
  const prev = inFlight.get(storeKey) || Promise.resolve();
  const pending = prev.catch(() => {}).then(work);
  inFlight.set(storeKey, pending);
  void pending.finally(() => { if (inFlight.get(storeKey) === pending) inFlight.delete(storeKey); }).catch(() => {});
  return pending;
}
export async function loadPrivateDraft(kind, owner) {
  const storeKey = key(kind, owner);
  await (inFlight.get(storeKey) || Promise.resolve()).catch(() => {});
  const entry = await transact('get', storeKey);
  if (!entry || entry.version !== SCHEMA || entry.owner !== owner || entry.kind !== kind ||
      !Number.isFinite(entry.updatedAt) || Date.now() - entry.updatedAt > LIFE_MS) {
    if (entry) await clearPrivateDraft(kind, owner);
    return null;
  }
  return entry.payload || null;
}
export function savePrivateDraft(kind, owner, payload) {
  const storeKey = key(kind, owner);
  return serial(storeKey, () => transact('put', storeKey, { version: SCHEMA, kind, owner, updatedAt: Date.now(), payload }));
}
export function clearPrivateDraft(kind, owner) {
  const storeKey = key(kind, owner);
  return serial(storeKey, () => transact('delete', storeKey));
}
