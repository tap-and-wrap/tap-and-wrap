import { createHash, randomUUID } from 'node:crypto';
import { env } from '../config/env.js';
import { assertDatabaseWriteAllowed } from '../config/database-safety.js';
import { TrackingConsent } from '../models/TrackingConsent.js';
import { MetaEvent, META_EVENTS } from '../models/MetaEvent.js';
import { commerceError, checkedMoney } from '../commerce/errors.js';
import { boundedOperation, shouldStop } from '../commerce/work-budget.js';

let testProvider;
export const tokenHash = (token) => createHash('sha256').update(token).digest('hex');
export function trackingSettings(settings = process.env) {
  let origin = '';
  try { const url = new URL(settings.SITE_ORIGIN); if (url.protocol === 'https:' && !url.username && !url.password && url.pathname === '/' && !url.search && !url.hash) origin = url.origin; } catch { /* Missing approved origin leaves tracking disabled. */ }
  const pixelId = settings.META_PIXEL_ID || '';
  const policyVersion = settings.META_CONSENT_POLICY_VERSION || '';
  const enabled = settings.META_ENABLED === 'true' && settings.META_POLICY_APPROVED === 'true' && /^\d{5,30}$/.test(pixelId) && /^[a-zA-Z0-9._-]{1,80}$/.test(policyVersion) && Boolean(origin);
  return { enabled, origin, policyVersion, pixelId: enabled ? pixelId : null,
    capiEnabled: enabled && settings.META_CAPI_ENABLED === 'true' && Boolean(settings.META_ACCESS_TOKEN) && /^v\d{1,3}\.\d+$/.test(settings.META_API_VERSION || '') };
}
export function publicTrackingPath(path) {
  return typeof path === 'string' && path.length <= 250 && /^(?:\/(?:shop|customize(?:\/(?:gift-box|laser-engraving))?|about|contact|privacy-policy|refund-policy|shipping-policy|terms-of-service)?|\/(?:products|categories)\/[a-z0-9]+(?:-[a-z0-9]+)*)$/.test(path);
}
export async function currentConsent(req, { session } = {}) {
  if (req.headers?.['sec-gpc'] === '1' || req.headers?.['x-tracking-consent'] === 'denied') return null;
  const settings = trackingSettings();
  const token = req.cookies?.tw_meta_consent;
  if (!settings.enabled || typeof token !== 'string' || !/^[a-f0-9]{64}$/.test(token)) return null;
  return TrackingConsent.findOne({ tokenHash: tokenHash(token), granted: true, policyVersion: settings.policyVersion, expiresAt: { $gt: new Date() } }).session(session || null).lean().maxTimeMS(3000);
}
export function monetaryParameters(lines, totalPiastres) {
  const total = checkedMoney(totalPiastres);
  if (!Array.isArray(lines) || lines.length > 30) throw commerceError(400, 'INVALID_TRACKING_EVENT', 'Unsupported event items.');
  const contents = lines.map((line) => {
    const id = String(line.productId || line._id || '');
    if (!/^[a-f0-9]{24}$/i.test(id) || !Number.isSafeInteger(line.quantity) || line.quantity < 1 || line.quantity > 99) throw commerceError(400, 'INVALID_TRACKING_EVENT', 'Unsupported event items.');
    return { id, quantity: line.quantity, item_price: checkedMoney(line.unitPricePiastres ?? line.pricePiastres) / 100 };
  });
  return { currency: 'EGP', value: total / 100, content_type: 'product', content_ids: contents.map((item) => item.id), contents, num_items: contents.reduce((total, item) => total + item.quantity, 0) };
}
export function trackingReceipt(event) { return event ? { id: event.eventId, name: event.name, parameters: event.parameters } : null; }
function validEgpAmount(value) {
  const cents = value * 100;
  return Number.isFinite(value) && value >= 0 && Number.isSafeInteger(Math.round(cents))
    && Math.abs(cents - Math.round(cents)) <= Math.max(0.000001, Number.EPSILON * Math.abs(cents) * 2);
}
export function sanitizeParameters(parameters) {
  const allowed = new Set(['currency', 'value', 'content_type', 'content_ids', 'contents', 'num_items', 'payment_method', 'service_kind']);
  if (!parameters || typeof parameters !== 'object' || Array.isArray(parameters) || Object.keys(parameters).some(key => !allowed.has(key))) throw commerceError(400, 'INVALID_TRACKING_EVENT', 'Unsupported tracking data.');
  if (parameters.currency !== undefined && parameters.currency !== 'EGP' || parameters.value !== undefined && !validEgpAmount(parameters.value)) throw commerceError(400, 'INVALID_TRACKING_EVENT', 'Unsupported tracking amount.');
  if (parameters.content_ids && (!Array.isArray(parameters.content_ids) || parameters.content_ids.length > 30 || parameters.content_ids.some(id => !/^[a-f0-9]{24}$/i.test(id)))) throw commerceError(400, 'INVALID_TRACKING_EVENT', 'Unsupported tracking items.');
  if (parameters.contents && (!Array.isArray(parameters.contents) || parameters.contents.length > 30 || parameters.contents.some(item => !item || typeof item !== 'object' || Object.keys(item).some(key => !['id', 'quantity', 'item_price'].includes(key)) || !/^[a-f0-9]{24}$/i.test(item.id) || !Number.isInteger(item.quantity) || item.quantity < 1 || item.quantity > 99 || !validEgpAmount(item.item_price)))) throw commerceError(400, 'INVALID_TRACKING_EVENT', 'Unsupported tracking items.');
  if (parameters.num_items !== undefined && (!Number.isSafeInteger(parameters.num_items) || parameters.num_items < 0)) throw commerceError(400, 'INVALID_TRACKING_EVENT', 'Unsupported tracking item count.');
  if (parameters.payment_method !== undefined && !['cod', 'instapay'].includes(parameters.payment_method) || parameters.service_kind !== undefined && !['gift_box', 'laser_engraving', 'tray', 'generic'].includes(parameters.service_kind) || parameters.content_type !== undefined && parameters.content_type !== 'product') throw commerceError(400, 'INVALID_TRACKING_EVENT', 'Unsupported tracking options.');
  return JSON.parse(JSON.stringify(parameters));
}
export async function recordQualifiedEvent(consentId, name, parameters, { sourcePath = '/', dedupKey = randomUUID(), session } = {}) {
  const settings = trackingSettings();
  if (!settings.enabled || !consentId) return null;
  if (!META_EVENTS.includes(name) || (!publicTrackingPath(sourcePath) && sourcePath !== '/checkout')) throw commerceError(400, 'INVALID_TRACKING_EVENT', 'Unsupported tracking event.');
  parameters = sanitizeParameters(parameters);
  const consent = await TrackingConsent.findOne({ _id: consentId, granted: true, policyVersion: settings.policyVersion, expiresAt: { $gt: new Date() } }).session(session || null).lean();
  if (!consent) return null;
  const key = name === 'Purchase' ? `${name}:${dedupKey}` : `${consent._id}:${name}:${dedupKey}`;
  assertDatabaseWriteAllowed(MetaEvent.db, env);
  try {
    await MetaEvent.updateOne({ dedupKey: key }, { $setOnInsert: { eventId: randomUUID(), dedupKey: key, consentId, name, sourcePath, parameters,
      state: 'queued', nextAttemptAt: new Date(), ...(name === 'Purchase' ? {} : { expiresAt: new Date(Date.now() + 30 * 86400000) }) } }, { upsert: true, session });
  } catch (error) { if (error.code !== 11000 || session) throw error; }
  return trackingReceipt(await MetaEvent.findOne({ dedupKey: key, consentId }).session(session || null).lean());
}
// Tracking cannot turn a successful storefront action into a failed purchase.
export async function captureAction(req, name, parameters, options) {
  try { const consent = await currentConsent(req); return await recordQualifiedEvent(consent?._id, name, parameters, options); }
  catch { return null; }
}
export async function recordOrderTracking(order, { session } = {}) {
  if (!order.trackingConsentId || !trackingSettings().enabled) return null;
  const parameters = { ...monetaryParameters(order.lines, order.totals.totalPiastres), payment_method: order.paymentMethod };
  const qualifies = order.paymentMethod === 'cod' || order.paymentState === 'paid';
  return recordQualifiedEvent(order.trackingConsentId, qualifies ? 'Purchase' : 'OrderSubmitted', parameters, { sourcePath: '/checkout', dedupKey: String(order._id), session });
}
export async function ownedPurchaseReceipt(order, req) {
  const consent = await currentConsent(req);
  if (!consent || String(consent._id) !== String(order.trackingConsentId)) return null;
  return trackingReceipt(await MetaEvent.findOne({ dedupKey: `Purchase:${order._id}`, consentId: consent._id, browserAcknowledgedAt: null }).lean().maxTimeMS(3000));
}
export function createMetaProvider(settings = process.env) {
  if (process.env.NODE_ENV === 'test') throw commerceError(503, 'TEST_PROVIDER_NOT_CONFIGURED', 'Live tracking is forbidden in tests.');
  const config = trackingSettings(settings);
  if (!config.capiEnabled) throw commerceError(503, 'META_DISABLED', 'Tracking delivery is disabled.');
  return { async send(event, { signal } = {}) {
    const response = await fetch(`https://graph.facebook.com/${settings.META_API_VERSION}/${config.pixelId}/events`, {
      method: 'POST', signal: signal ? AbortSignal.any([signal, AbortSignal.timeout(15000)]) : AbortSignal.timeout(15000), headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${settings.META_ACCESS_TOKEN}` },
      body: JSON.stringify({ data: [{ event_name: event.name, event_time: Math.floor(new Date(event.createdAt).getTime() / 1000), event_id: event.eventId,
        action_source: 'website', event_source_url: config.origin + event.sourcePath,
        user_data: { external_id: [tokenHash(String(event.consentId))] }, custom_data: event.parameters }] }),
    });
    if (!response.ok) throw commerceError(503, 'META_DELIVERY_FAILED', 'Tracking delivery failed.');
    const result = await response.json();
    if (result.events_received !== 1) throw commerceError(503, 'META_DELIVERY_FAILED', 'Tracking delivery failed.');
    return { accepted: true };
  } };
}
export function setMetaProviderForTests(provider) {
  if (process.env.NODE_ENV !== 'test') throw new Error('Test-only tracking adapter.');
  testProvider = provider;
}
export async function runMetaBatch({ batchSize = 20, now = new Date(), budget } = {}) {
  if (!Number.isInteger(batchSize) || batchSize < 1 || batchSize > 100) throw new Error('Tracking batch size must be 1–100.');
  const config = trackingSettings();
  const mock = process.env.NODE_ENV === 'test' && testProvider;
  if (!config.enabled || !mock && (!config.capiEnabled || process.env.NODE_ENV === 'test')) return { enabled: false, sent: 0, failed: 0, suppressed: 0 };
  const provider = mock || createMetaProvider();
  const counts = { enabled: true, sent: 0, failed: 0, suppressed: 0 };
  if (shouldStop(budget)) return { ...counts, stopped: true };
  assertDatabaseWriteAllowed(MetaEvent.db, env);
  const exhausted = await MetaEvent.find({ state: 'processing', leaseUntil: { $lte: now }, attempts: { $gte: 5 } }).select('_id').limit(batchSize).lean();
  if (exhausted.length) await MetaEvent.updateMany({ _id: { $in: exhausted.map(event => event._id) }, state: 'processing', leaseUntil: { $lte: now } }, { $set: { state: 'dead', lastErrorCode: 'RETRY_LIMIT' }, $unset: { leaseToken: 1, leaseUntil: 1 } });
  for (let index = 0; index < batchSize; index += 1) {
    if (shouldStop(budget)) { counts.stopped = true; break; }
    const leaseToken = randomUUID();
    const event = await MetaEvent.findOneAndUpdate({ attempts: { $lt: 5 }, $or: [{ state: { $in: ['queued', 'failed'] }, nextAttemptAt: { $lte: now } }, { state: 'processing', leaseUntil: { $lte: now } }] },
      { $set: { state: 'processing', leaseToken, leaseUntil: new Date(now.getTime() + 120000) }, $inc: { attempts: 1 } }, { new: true, sort: { nextAttemptAt: 1, _id: 1 } }).select('+leaseToken').lean();
    if (!event) break;
    const consent = await TrackingConsent.exists({ _id: event.consentId, granted: true, policyVersion: config.policyVersion, expiresAt: { $gt: now } });
    const filter = { _id: event._id, state: 'processing', leaseToken };
    if (!consent || new Date(event.createdAt).getTime() < now.getTime() - 7 * 86400000) {
      await MetaEvent.updateOne(filter, { $set: { state: 'suppressed' }, $unset: { leaseToken: 1, leaseUntil: 1 } }); counts.suppressed += 1; continue;
    }
    try {
      const result = await boundedOperation(signal => provider.send(event, { signal }), { timeoutMs: 15000, budget, code: 'META_DELIVERY_TIMEOUT' });
      if (result?.accepted !== true) throw new Error('Tracking provider did not confirm acceptance.');
      const saved = await MetaEvent.updateOne(filter, { $set: { state: 'sent', sentAt: now }, $unset: { leaseToken: 1, leaseUntil: 1 } }); counts.sent += saved.modifiedCount;
    } catch {
      await MetaEvent.updateOne(filter, { $set: { state: event.attempts >= 5 ? 'dead' : 'failed', lastErrorCode: 'META_DELIVERY_FAILED', nextAttemptAt: new Date(now.getTime() + Math.min(3600000, 60000 * 2 ** (event.attempts - 1))) }, $unset: { leaseToken: 1, leaseUntil: 1 } }); counts.failed += 1;
    }
  }
  return counts;
}
