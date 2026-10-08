import { api, safePost } from '../services/api.js';

const ENABLED = import.meta.env.VITE_META_ENABLED === 'true';
const STANDARD = new Set(['PageView', 'ViewContent', 'Search', 'AddToCart', 'InitiateCheckout', 'AddPaymentInfo', 'CompleteRegistration', 'Contact', 'Purchase']);
const CUSTOM = new Set(['CustomizationStart', 'CustomizedAddToCart', 'OrderSubmitted']);
const SEEN_KEY = 'tw-meta-seen-v1';
const CHOICE_KEY = 'tw-meta-choice-v1';
const PURCHASE_KEY = 'tw-meta-purchases-v1';
let configuration;
let configurationPromise;
let initializedPixel;
const pending = [];
const actionRequests = new Map();
const acknowledgements = new Map();
let seen = new Set();
let purchases = new Set();
try { seen = new Set(JSON.parse(sessionStorage.getItem(SEEN_KEY) || '[]').filter(value => typeof value === 'string').slice(-200)); } catch { /* Storage can be unavailable. */ }
try { purchases = new Set(JSON.parse(localStorage.getItem(PURCHASE_KEY) || '[]').filter(value => typeof value === 'string').slice(-500)); } catch { /* Server acknowledgements provide durable deduplication. */ }

export const globalPrivacyControl = () => navigator.globalPrivacyControl === true;
export function trackingChoice() { try { return JSON.parse(localStorage.getItem(CHOICE_KEY) || 'null'); } catch { return null; } }
function rememberChoice(choice, version) { try { localStorage.setItem(CHOICE_KEY, JSON.stringify({ choice, version })); } catch { /* Consent still remains in server cookie. */ } }
function denied() { return globalPrivacyControl() || trackingChoice()?.choice === 'declined'; }
api.interceptors.request.use(request => {
  if (ENABLED && denied()) request.headers.set('x-tracking-consent', 'denied');
  return request;
});
export function publicTrackingPath(path) {
  return /^(?:\/(?:shop|customize(?:\/(?:gift-box|laser-engraving))?|about|contact|privacy-policy|refund-policy|shipping-policy|terms-of-service)?|\/(?:products|categories)\/[a-z0-9]+(?:-[a-z0-9]+)*)$/.test(path);
}

function validateReceipt(receipt) {
  if (!receipt || !/^[a-f0-9-]{36}$/i.test(receipt.id) || !STANDARD.has(receipt.name) && !CUSTOM.has(receipt.name)) return null;
  const parameters = receipt.parameters;
  const allowed = new Set(['currency', 'value', 'content_type', 'content_ids', 'contents', 'num_items', 'payment_method', 'service_kind']);
  if (!parameters || Array.isArray(parameters) || typeof parameters !== 'object' || Object.keys(parameters).some(key => !allowed.has(key))) return null;
  if (parameters.currency !== undefined && parameters.currency !== 'EGP' || parameters.value !== undefined && (!Number.isFinite(parameters.value) || parameters.value < 0)) return null;
  if (parameters.content_ids && (!Array.isArray(parameters.content_ids) || parameters.content_ids.length > 30 || parameters.content_ids.some(id => !/^[a-f0-9]{24}$/i.test(id)))) return null;
  if (parameters.contents && (!Array.isArray(parameters.contents) || parameters.contents.length > 30 || parameters.contents.some(item => !item || Object.keys(item).some(key => !['id', 'quantity', 'item_price'].includes(key)) || !/^[a-f0-9]{24}$/i.test(item.id) || !Number.isSafeInteger(item.quantity) || item.quantity < 1 || item.quantity > 99 || !Number.isFinite(item.item_price) || item.item_price < 0))) return null;
  if (parameters.num_items !== undefined && (!Number.isSafeInteger(parameters.num_items) || parameters.num_items < 0)
    || parameters.payment_method !== undefined && !['cod', 'instapay'].includes(parameters.payment_method)
    || parameters.service_kind !== undefined && !['gift_box', 'laser_engraving', 'tray', 'generic'].includes(parameters.service_kind)
    || parameters.content_type !== undefined && parameters.content_type !== 'product') return null;
  return { id: receipt.id, name: receipt.name, parameters: structuredClone(parameters) };
}

function startPixel() {
  if (!configuration?.enabled || !configuration.consent || denied()) return false;
  if (!window.fbq) {
    const fbq = function (...args) { if (fbq.callMethod) fbq.callMethod(...args); else fbq.queue.push(args); };
    fbq.push = fbq; fbq.loaded = true; fbq.version = '2.0'; fbq.queue = [];
    window.fbq = fbq; window._fbq = fbq;
    const script = document.createElement('script'); script.async = true; script.src = 'https://connect.facebook.net/en_US/fbevents.js';
    script.dataset.tapWrapTracking = 'true'; document.head.append(script);
  }
  if (initializedPixel !== configuration.pixelId) {
    window.fbq('set', 'autoConfig', false, configuration.pixelId);
    window.fbq('init', configuration.pixelId); initializedPixel = configuration.pixelId;
  }
  window.fbq('consent', 'grant');
  return true;
}

export function configureTracking(config) {
  const valid = config?.enabled === true && /^\d{5,30}$/.test(config.pixelId || '') && /^[\w.-]{1,80}$/.test(config.policyVersion || '');
  configuration = valid ? { ...config, consent: config.consent === true && !denied() } : { enabled: false, consent: false };
  if (!configuration.consent) { pending.length = 0; window.fbq?.('consent', 'revoke'); return configuration; }
  // Loading a private/account page with an existing preference does not itself
  // load the SDK. Only a qualified server receipt can start it.
  for (const receipt of pending.splice(0)) emitTracking(receipt);
  return configuration;
}

export async function getTrackingConfiguration() {
  if (!ENABLED) return configureTracking({ enabled: false });
  if (!configurationPromise) configurationPromise = api.get('/tracking/config').then(response => configureTracking(response.data.data)).catch(() => configureTracking({ enabled: false }));
  return configurationPromise;
}

export function emitTracking(receiptOrArray) {
  if (!ENABLED || denied()) return false;
  if (Array.isArray(receiptOrArray)) return receiptOrArray.map(emitTracking).some(Boolean);
  const receipt = validateReceipt(receiptOrArray);
  if (!receipt) return false;
  if (seen.has(receipt.id) || receipt.name === 'Purchase' && purchases.has(receipt.id)) {
    if (receipt.name === 'Purchase') void acknowledgePurchase(receipt.id);
    return false;
  }
  if (!configuration) { if (pending.length < 30) pending.push(receipt); void getTrackingConfiguration(); return false; }
  if (!startPixel()) return false;
  try {
    window.fbq(STANDARD.has(receipt.name) ? 'track' : 'trackCustom', receipt.name, receipt.parameters, { eventID: receipt.id });
    seen.add(receipt.id); seen = new Set([...seen].slice(-200));
    try { sessionStorage.setItem(SEEN_KEY, JSON.stringify([...seen])); } catch { /* Memory still prevents same-page duplicates. */ }
    if (receipt.name === 'Purchase') {
      purchases.add(receipt.id); purchases = new Set([...purchases].slice(-500));
      try { localStorage.setItem(PURCHASE_KEY, JSON.stringify([...purchases])); } catch { /* Server ack remains the durable marker. */ }
      void acknowledgePurchase(receipt.id);
    }
    return true;
  } catch { return false; }
}

function acknowledgePurchase(eventId) {
  if (!configuration?.consent || denied()) return Promise.resolve(false);
  if (!acknowledgements.has(eventId)) {
    acknowledgements.set(eventId, safePost('/tracking/ack', { eventId }).then(() => true).catch(() => { acknowledgements.delete(eventId); return false; }));
    if (acknowledgements.size > 200) acknowledgements.delete(acknowledgements.keys().next().value);
  }
  return acknowledgements.get(eventId);
}

export async function saveTrackingConsent(granted) {
  if (!ENABLED || granted && globalPrivacyControl()) throw new Error('Your browser privacy preference keeps optional tracking off.');
  if (!granted) {
    rememberChoice('declined', configuration?.policyVersion);
    configureTracking({ ...configuration, consent: false });
  }
  const response = await safePost('/tracking/consent', { granted });
  if (granted && response.data.data.consent === true) rememberChoice('granted', configuration?.policyVersion);
  return configureTracking({ ...configuration, consent: response.data.data.consent === true });
}

export async function pageTracking(path, eventId) {
  if (!ENABLED || !publicTrackingPath(path) || !configuration?.consent || denied()) return null;
  if (!actionRequests.has(eventId)) {
    actionRequests.set(eventId, safePost('/tracking/events', { name: 'PageView', eventId, path })
      .then(response => { emitTracking(response.data.data.tracking); return response.data.data.tracking; }).catch(() => null));
    if (actionRequests.size > 100) actionRequests.delete(actionRequests.keys().next().value);
  }
  return actionRequests.get(eventId);
}

export async function contactTracking() {
  if (!ENABLED || !configuration?.consent || denied() || location.pathname !== '/contact') return null;
  try {
    const response = await safePost('/tracking/events', { name: 'Contact', eventId: crypto.randomUUID(), path: '/contact' });
    emitTracking(response.data.data.tracking); return response.data.data.tracking;
  } catch { return null; }
}
