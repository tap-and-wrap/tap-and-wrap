import { createHash, randomBytes } from 'node:crypto';
import { env } from '../config/env.js';
import { requireAuth } from '../middleware/auth.js';

const ownerFor = token => `guest:${createHash('sha256').update(token).digest('hex')}`;
export function guestOwner(req) {
  const token = req.cookies?.tw_cart;
  return typeof token === 'string' && /^[a-f0-9]{64}$/.test(token) ? ownerFor(token) : null;
}
export function rotateGuestCookie(res) {
  const token = randomBytes(32).toString('hex');
  res.cookie('tw_cart', token, { httpOnly: true, secure: env.nodeEnv === 'production', sameSite: 'lax', path: '/', maxAge: 30 * 86400000 });
  return ownerFor(token);
}
export function commerceOwner(req, res, next) {
  res.set('Cache-Control', 'private, no-store'); res.set('X-Robots-Tag', 'noindex, nofollow'); res.vary('Cookie');
  if (req.cookies?.tw_session) return requireAuth(req, res, () => { req.commerceOwner = `user:${req.user._id}`; next(); });
  req.commerceOwner = guestOwner(req) || rotateGuestCookie(res); next();
}
