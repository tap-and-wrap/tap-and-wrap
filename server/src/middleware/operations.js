import { randomUUID } from 'node:crypto';
import { isIP } from 'node:net';

export function requestContext(req, res, next) {
  // Generate locally: never trust arbitrary client correlation IDs or log payloads.
  req.requestId = randomUUID();
  res.set('X-Request-Id', req.requestId);
  next();
}

/** Validate only a forwarding chain delivered by an explicitly trusted immediate peer. */
export function forwardingGuard(req, res, next) {
  const trust = req.app.get('trust proxy fn');
  const trustedPeer = typeof trust === 'function' && trust(req.socket.remoteAddress, 0);
  delete req.headers.forwarded;
  delete req.headers['x-real-ip'];
  if (!trustedPeer) {
    delete req.headers['x-forwarded-for'];
    delete req.headers['x-forwarded-host'];
    delete req.headers['x-forwarded-proto'];
    return next();
  }
  const forwarded = req.headers['x-forwarded-for'];
  if (forwarded !== undefined && (typeof forwarded !== 'string' || forwarded.length > 2048
    || forwarded.split(',').length > 16 || forwarded.split(',').some(value => !isIP(value.trim())))) {
    return res.status(400).json({ ok: false, error: { code: 'INVALID_FORWARDING', message: 'Forwarding information is invalid.' } });
  }
  const protocol = req.headers['x-forwarded-proto'];
  if (protocol !== undefined && !['http', 'https'].includes(protocol)) {
    return res.status(400).json({ ok: false, error: { code: 'INVALID_FORWARDING', message: 'Forwarding information is invalid.' } });
  }
  // Host/origin authorization uses explicit configured origins, never forwarded hosts.
  delete req.headers['x-forwarded-host'];
  next();
}

export function sanitizedRequestDiagnostic(req, code = 'SERVER_ERROR') {
  return { event: 'request_failed', requestId: req.requestId, code: /^[A-Z0-9_]+$/.test(code) ? code : 'SERVER_ERROR' };
}
