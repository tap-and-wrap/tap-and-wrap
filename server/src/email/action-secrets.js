import { createHash, createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';
import { env, assertAuthConfig } from '../config/env.js';
import { emailError } from './settings.js';
import { safeClientOrigin } from './templates.js';

function key() { assertAuthConfig(); return createHash('sha256').update(`tap-and-wrap:email-action:v1:${env.sessionSecret}`).digest(); }

export function sealActionToken(token, eventKey) {
  if (!/^[A-Za-z0-9_-]{43}$/.test(token)) throw emailError('INVALID_ACCOUNT_TOKEN');
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', key(), iv);
  cipher.setAAD(Buffer.from(eventKey));
  const ciphertext = Buffer.concat([cipher.update(token, 'utf8'), cipher.final()]);
  return `${iv.toString('base64url')}.${ciphertext.toString('base64url')}.${cipher.getAuthTag().toString('base64url')}`;
}

export function accountActionUrl(event, clientOrigin = env.clientOrigin) {
  if (!['password_reset', 'email_verification'].includes(event.event)) return undefined;
  try {
    const parts = String(event.sealedActionToken || '').split('.');
    if (parts.length !== 3 || parts.some(part => !/^[A-Za-z0-9_-]+$/.test(part))) throw new Error();
    const decipher = createDecipheriv('aes-256-gcm', key(), Buffer.from(parts[0], 'base64url'));
    decipher.setAAD(Buffer.from(event.eventKey));
    decipher.setAuthTag(Buffer.from(parts[2], 'base64url'));
    const token = Buffer.concat([decipher.update(Buffer.from(parts[1], 'base64url')), decipher.final()]).toString('utf8');
    if (!/^[A-Za-z0-9_-]{43}$/.test(token)) throw new Error();
    const url = new URL(event.event === 'password_reset' ? '/reset-password' : '/verify-email', safeClientOrigin(clientOrigin));
    url.hash = `token=${token}`;
    return url.href;
  } catch { throw emailError('INVALID_ACCOUNT_ACTION_SECRET', { terminal: true }); }
}
