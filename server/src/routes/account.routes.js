import { Router } from 'express';
import { z } from 'zod';
import { randomInt } from 'node:crypto';
import { setTimeout as delay } from 'node:timers/promises';
import { rateLimit } from 'express-rate-limit';
import { requireAuth } from '../middleware/auth.js';
import { csrfProtection } from '../middleware/csrf.js';
import { requireCatalogDatabase } from './catalog.routes.js';
import { User } from '../models/User.js';
import { requestAccountAction, resetAccountPassword, verifyAccountEmail } from '../email/account-actions.js';
import { emailSettings } from '../email/settings.js';
import { newPasswordSchema } from '../utils/password.js';

const router = Router();
const rateLimitResponse = (req, res) => res.status(429).json({ ok: false, error: { code: 'RATE_LIMITED', message: 'Too many account requests. Please try again later.' } });
const requestLimit = rateLimit({ windowMs: 15 * 60 * 1000, limit: 5, standardHeaders: 'draft-8', legacyHeaders: false, handler: rateLimitResponse });
const actionLimit = rateLimit({ windowMs: 15 * 60 * 1000, limit: 10, standardHeaders: 'draft-8', legacyHeaders: false, handler: rateLimitResponse });
const emailSchema = z.object({ email: z.email().max(254) }).strict();
const tokenSchema = z.string().regex(/^[A-Za-z0-9_-]{43}$/);
const resetSchema = z.object({ token: tokenSchema, newPassword: newPasswordSchema }).strict();
const verificationSchema = z.object({ token: tokenSchema }).strict();
const MESSAGE = 'If this account can receive email, a secure link has been queued. Delivery may be unavailable until email is configured.';

router.use((req, res, next) => {
  res.set({ 'Cache-Control': 'private, no-store', 'X-Robots-Tag': 'noindex, nofollow, noarchive', 'Referrer-Policy': 'no-referrer' });
  res.vary('Cookie'); next();
});

async function uniformRequest(work) {
  const start = Date.now();
  try { await work(); }
  finally { await delay(Math.max(0, 200 + randomInt(0, 50) - (Date.now() - start))); }
}

router.post('/forgot-password', requireCatalogDatabase, requestLimit, csrfProtection, async (req, res, next) => {
  try {
    const input = emailSchema.parse(req.body);
    await uniformRequest(() => requestAccountAction(input.email, 'password_reset'));
    res.status(202).json({ ok: true, data: { message: MESSAGE } });
  } catch (error) { next(error); }
});

router.post('/reset-password', requireCatalogDatabase, actionLimit, csrfProtection, async (req, res, next) => {
  try {
    const input = resetSchema.parse(req.body);
    await resetAccountPassword(input.token, input.newPassword);
    res.clearCookie('tw_session', { httpOnly: true, secure: process.env.NODE_ENV === 'production', sameSite: 'lax', path: '/' });
    res.json({ ok: true, data: { passwordReset: true, signInRequired: true } });
  } catch (error) { next(error); }
});

router.post('/request-verification', requireCatalogDatabase, requestLimit, csrfProtection, requireAuth, async (req, res, next) => {
  try {
    z.object({}).strict().parse(req.body);
    await uniformRequest(() => requestAccountAction(req.user.email, 'email_verification', { userId: req.user._id }));
    res.status(202).json({ ok: true, data: { message: MESSAGE } });
  } catch (error) { next(error); }
});

router.post('/verify-email', requireCatalogDatabase, actionLimit, csrfProtection, async (req, res, next) => {
  try {
    const input = verificationSchema.parse(req.body);
    await verifyAccountEmail(input.token);
    res.json({ ok: true, data: { emailVerified: true } });
  } catch (error) { next(error); }
});

router.get('/account-status', requireCatalogDatabase, requireAuth, async (req, res, next) => {
  try {
    const user = await User.findById(req.user._id).select('emailVerifiedAt').lean();
    const settings = emailSettings();
    const eligibleRecipient = settings.production || settings.safeRecipients.includes(req.user.email.toLowerCase());
    res.json({ ok: true, data: { emailVerified: Boolean(user?.emailVerifiedAt), emailDeliveryConfigured: settings.enabled && settings.configured && eligibleRecipient } });
  } catch (error) { next(error); }
});

export function resetAccountRateLimitsForTests() {
  if (process.env.NODE_ENV !== 'test') throw new Error('Test-only rate limit helper.');
  requestLimit.resetKey('127.0.0.1'); actionLimit.resetKey('127.0.0.1');
}
export default router;
