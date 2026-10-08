import { Router } from 'express';
import { randomBytes } from 'node:crypto';
import { z } from 'zod';
import { rateLimit } from 'express-rate-limit';
import { env } from '../config/env.js';
import { assertDatabaseWriteAllowed } from '../config/database-safety.js';
import { csrfProtection } from '../middleware/csrf.js';
import { requireCommerceDatabase } from '../commerce/routes.js';
import { TrackingConsent } from '../models/TrackingConsent.js';
import { MetaEvent } from '../models/MetaEvent.js';
import { captureAction, currentConsent, publicTrackingPath, tokenHash, trackingSettings } from './service.js';

const router = Router();
const actionLimit = rateLimit({ windowMs: 60000, limit: 30, standardHeaders: 'draft-8', legacyHeaders: false,
  handler: (req, res) => res.status(429).json({ ok: false, error: { code: 'RATE_LIMITED', message: 'Too many optional tracking requests.' } }) });
export function resetTrackingLimitsForTests() {
  if (process.env.NODE_ENV !== 'test') throw new Error('Test-only tracking rate-limit reset.');
  actionLimit.resetKey('127.0.0.1');
}
router.use((req, res, next) => { res.set('Cache-Control', 'private, no-store'); res.set('X-Robots-Tag', 'noindex, nofollow'); next(); });
router.get('/config', async (req, res) => {
  const config = trackingSettings();
  const consent = config.enabled ? await currentConsent(req) : null;
  res.json({ ok: true, data: { enabled: config.enabled, pixelId: config.pixelId, policyVersion: config.policyVersion, consent: Boolean(consent) } });
});
router.use(requireCommerceDatabase, actionLimit, csrfProtection);
router.post('/consent', async (req, res) => {
  const { granted } = z.object({ granted: z.boolean() }).strict().parse(req.body);
  const config = trackingSettings();
  const existingToken = req.cookies?.tw_meta_consent;
  if (!granted) {
    if (typeof existingToken === 'string' && /^[a-f0-9]{64}$/.test(existingToken)) {
      assertDatabaseWriteAllowed(TrackingConsent.db, env);
      const record = await TrackingConsent.findOneAndUpdate({ tokenHash: tokenHash(existingToken) }, { $set: { granted: false } });
      if (record) { assertDatabaseWriteAllowed(MetaEvent.db, env); await MetaEvent.updateMany({ consentId: record._id, state: { $in: ['queued', 'failed'] } }, { $set: { state: 'suppressed' } }); }
    }
    res.clearCookie('tw_meta_consent', { path: '/' });
    return res.json({ ok: true, data: { consent: false } });
  }
  if (!config.enabled) return res.status(403).json({ ok: false, error: { code: 'TRACKING_DISABLED', message: 'Optional tracking is disabled.' } });
  if (req.headers['sec-gpc'] === '1') return res.status(403).json({ ok: false, error: { code: 'PRIVACY_SIGNAL', message: 'Your browser privacy signal keeps optional tracking off.' } });
  const current = await currentConsent(req);
  if (current) return res.json({ ok: true, data: { consent: true } });
  if (typeof existingToken === 'string' && /^[a-f0-9]{64}$/.test(existingToken)) {
    assertDatabaseWriteAllowed(TrackingConsent.db, env);
    const old = await TrackingConsent.findOneAndUpdate({ tokenHash: tokenHash(existingToken) }, { $set: { granted: false } });
    if (old) { assertDatabaseWriteAllowed(MetaEvent.db, env); await MetaEvent.updateMany({ consentId: old._id, state: { $in: ['queued', 'failed'] } }, { $set: { state: 'suppressed' } }); }
  }
  const token = randomBytes(32).toString('hex');
  assertDatabaseWriteAllowed(TrackingConsent.db, env);
  await TrackingConsent.create({ tokenHash: tokenHash(token), granted: true, policyVersion: config.policyVersion, expiresAt: new Date(Date.now() + 180 * 86400000) });
  res.cookie('tw_meta_consent', token, { httpOnly: true, secure: env.nodeEnv === 'production', sameSite: 'lax', path: '/', maxAge: 180 * 86400000 });
  res.json({ ok: true, data: { consent: true } });
});
router.post('/events', async (req, res) => {
  const input = z.object({ name: z.enum(['PageView', 'Contact']), eventId: z.string().uuid(), path: z.string().max(250) }).strict().parse(req.body);
  if (!publicTrackingPath(input.path) || input.name === 'Contact' && input.path !== '/contact') return res.status(400).json({ ok: false, error: { code: 'INVALID_TRACKING_EVENT', message: 'Unsupported public action.' } });
  const event = await captureAction(req, input.name, {}, { sourcePath: input.path, dedupKey: input.eventId });
  res.json({ ok: true, data: { tracking: event } });
});
router.post('/ack', async (req, res) => {
  const { eventId } = z.object({ eventId: z.string().uuid() }).strict().parse(req.body);
  const consent = await currentConsent(req);
  if (!consent) return res.status(404).json({ ok: false, error: { code: 'TRACKING_EVENT_UNAVAILABLE', message: 'Tracking event is unavailable.' } });
  const filter = { eventId, consentId: consent._id, name: 'Purchase' };
  assertDatabaseWriteAllowed(MetaEvent.db, env);
  const changed = await MetaEvent.updateOne({ ...filter, browserAcknowledgedAt: null }, { $set: { browserAcknowledgedAt: new Date() } });
  if (!changed.matchedCount && !await MetaEvent.exists(filter)) return res.status(404).json({ ok: false, error: { code: 'TRACKING_EVENT_UNAVAILABLE', message: 'Tracking event is unavailable.' } });
  res.json({ ok: true, data: { acknowledged: true } });
});
export default router;
