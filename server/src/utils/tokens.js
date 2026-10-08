import { randomBytes, createHash, createHmac, timingSafeEqual } from 'node:crypto';
export const newSessionToken = () => randomBytes(32).toString('base64url');
export const hashSession = token => createHash('sha256').update(token).digest('hex');
export function makeCsrfToken(secret) {
 const nonce=randomBytes(24).toString('base64url');
 const sig=createHmac('sha256',secret).update(nonce).digest('hex');
 return `${nonce}.${sig}`;
}
export function validCsrfToken(token, secret) {
 if (typeof token!=='string' || !/^[A-Za-z0-9_-]{32}\.[0-9a-f]{64}$/.test(token)) return false;
 const [nonce,sig]=token.split('.');
 const expected=createHmac('sha256',secret).update(nonce).digest('hex');
 return timingSafeEqual(Buffer.from(sig,'hex'), Buffer.from(expected,'hex'));
}
