function origins(value) {
  if (!value) return [];
  if (typeof value !== 'string' || value.length > 4000) throw new Error('Browser policy origin configuration is invalid');
  const values = value.split(',').map((entry) => entry.trim());
  if (values.length > 8) throw new Error('Browser policy origin configuration is invalid');
  return [...new Set(values.map((entry) => {
    const url = new URL(entry);
    if (url.protocol !== 'https:' || url.username || url.password || url.search || url.hash || !['', '/'].includes(url.pathname) || /^(?:localhost|127\.|0\.|\[?::1\]?)/i.test(url.hostname)) throw new Error('Browser policy origin configuration is invalid');
    return url.origin;
  }))];
}

export function browserSecurityHeaders(configuration = {}) {
  const api = origins(configuration.BROWSER_API_ORIGINS);
  const media = origins(configuration.BROWSER_MEDIA_ORIGINS);
  const uploads = origins(configuration.BROWSER_UPLOAD_ORIGINS);
  const tracking = configuration.BROWSER_TRACKING_ALLOWED === 'true';
  const mode = configuration.BROWSER_CSP_MODE || 'report-only';
  if (!['report-only', 'enforce'].includes(mode)) throw new Error('Browser policy mode is invalid');
  const policy = ["default-src 'self'", `script-src 'self'${tracking ? ' https://connect.facebook.net' : ''}`, "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com", "font-src 'self' https://fonts.gstatic.com", `img-src 'self' data: blob:${media.length ? ` ${media.join(' ')}` : ''}${tracking ? ' https://www.facebook.com' : ''}`, `media-src 'self'${media.length ? ` ${media.join(' ')}` : ''}`, `connect-src 'self'${[...api, ...uploads].length ? ` ${[...api, ...uploads].join(' ')}` : ''}${tracking ? ' https://www.facebook.com' : ''}`, "object-src 'none'", "base-uri 'self'", "form-action 'self'", "frame-ancestors 'none'", "frame-src 'none'", "worker-src 'self' blob:"].join('; ');
  return { 'X-Content-Type-Options': 'nosniff', 'X-Frame-Options': 'DENY', 'Referrer-Policy': 'strict-origin-when-cross-origin', 'Permissions-Policy': 'camera=(), microphone=(), geolocation=(), payment=(), usb=(), browsing-topics=()', [mode === 'enforce' ? 'Content-Security-Policy' : 'Content-Security-Policy-Report-Only']: policy };
}

export function secureBrowserResponse(response, configuration) {
  const headers = new Headers(response.headers);
  Object.entries(browserSecurityHeaders(configuration)).forEach(([key, value]) => headers.set(key, value));
  return new Response(response.body, { status: response.status, statusText: response.statusText, headers });
}
