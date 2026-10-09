import { secureBrowserResponse } from './browser-policy.js';

const PRIVATE_DOCUMENT = /^\/(?:admin(?:\/|$)|cart(?:\/|$)|checkout(?:\/|$)|orders(?:\/|$)|my-orders(?:\/|$)|track-order(?:\/|$)|login(?:\/|$)|signup(?:\/|$)|forgot-password(?:\/|$)|reset-password(?:\/|$)|verify-email(?:\/|$))/;
const PRODUCT_CUSTOMIZE = /^\/products\/([a-z0-9]+(?:-[a-z0-9]+)*)\/customize$/;

async function manifestFor(assets, request) {
  try {
    const url = new URL('/seo-manifest.json', request.url);
    const response = await assets.fetch(new Request(url));
    if (!response.ok) return null;
    const value = await response.json();
    if (value.version !== 2 || !Array.isArray(value.publicRoutes) || !Array.isArray(value.indexableRoutes) || !Array.isArray(value.productSlugs) || value.publicRoutes.length > 25_000 || value.productSlugs.length > 10_000 || !/^[a-f0-9]{64}$/.test(value.publication?.id || '') || !value.routeFiles || !Array.isArray(value.publication.routes)) return null;
    if (value.publication.version !== 1 || !Number.isSafeInteger(value.publication.maximumAgeSeconds) || value.publication.maximumAgeSeconds < 60 || value.publication.maximumAgeSeconds > 86400 || Date.parse(value.publication.expiresAt) - Date.parse(value.publication.generatedAt) > value.publication.maximumAgeSeconds * 1000) return null;
    if (value.publicRoutes.some((pathname) => typeof pathname !== 'string' || !/^\/(?:[a-z0-9-]+(?:\/[a-z0-9-]+)*)?$/.test(pathname) || !value.routeFiles[pathname]) || value.indexableRoutes.some((pathname) => !value.publicRoutes.includes(pathname))) return null;
    if (Object.values(value.routeFiles).some((file) => typeof file !== 'string' || !new RegExp(`^/seo-pages/${value.publication.id}/(?:[a-z0-9-]+/)*[a-z0-9-]+\\.html$`).test(file))) return null;
    return value;
  } catch { return null; }
}

function privateResponse(response, status = response.status) {
  const headers = new Headers(response.headers);
  headers.set('X-Robots-Tag', 'noindex, nofollow, noarchive');
  headers.set('Cache-Control', 'private, no-store');
  headers.set('X-Content-Type-Options', 'nosniff');
  return new Response(response.body, { status, headers });
}

async function asset(assets, request, pathname) {
  const url = new URL(request.url);
  url.pathname = pathname;
  url.search = '';
  return assets.fetch(new Request(url, { method: request.method, headers: request.headers }));
}

function withdrawalPaths(value) {
  if (!value) return new Set();
  if (typeof value !== 'string' || value.length > 50000) throw new Error('Invalid withdrawal configuration');
  const values = value.split(',').map((entry) => entry.trim());
  if (values.length > 500 || values.some((entry) => !/^\/(?:products|categories)\/[a-z0-9]+(?:-[a-z0-9]+)*$/.test(entry))) throw new Error('Invalid withdrawal configuration');
  return new Set(values);
}

async function routeRequest(request, env) {
  if (!env.ASSETS?.fetch) return new Response('Website assets unavailable', { status: 503, headers: { 'Cache-Control': 'no-store', 'X-Robots-Tag': 'noindex' } });
  if (!['GET', 'HEAD'].includes(request.method)) return new Response('Method not allowed', { status: 405, headers: { Allow: 'GET, HEAD', 'Cache-Control': 'no-store', 'X-Robots-Tag': 'noindex' } });
  const url = new URL(request.url);
  const pathname = url.pathname;
  if (pathname.startsWith('/assets/') || /\.(?:webp|png|jpe?g|svg|ico|woff2?|mp4|webm|css|js)$/i.test(pathname)) return env.ASSETS.fetch(request);
  const manifest = await manifestFor(env.ASSETS, request);
  const canonicalPath = pathname === '/' ? '/' : pathname.replace(/\/+$/, '');
  const withdrawn = withdrawalPaths(env.SEO_WITHDRAWN_PATHS);
  if (withdrawn.has(canonicalPath) || /^\/seo-pages(?:\/|$)/.test(canonicalPath)) return privateResponse(await asset(env.ASSETS, request, manifest?.routeFiles?.['/404'] || '/404.html'), 404);
  const customize = PRODUCT_CUSTOMIZE.exec(canonicalPath);
  if (PRIVATE_DOCUMENT.test(canonicalPath) || customize && manifest?.productSlugs.includes(customize[1])) {
    const root = canonicalPath.split('/')[1];
    const shell = customize ? '/customize.html' : root === 'orders' ? '/my-orders.html' : `/${root}.html`;
    const response = await asset(env.ASSETS, request, manifest?.routeFiles?.[shell.replace(/\.html$/, '')] || shell);
    return privateResponse(response.ok ? response : await asset(env.ASSETS, request, '/index.html'));
  }
  if (canonicalPath === '/home') return Response.redirect(new URL('/', url), 308);
  if (!manifest) return privateResponse(new Response('Website catalog snapshot unavailable', { status: 503, headers: { 'Content-Type': 'text/plain; charset=utf-8' } }));
  const fresh = Number.isFinite(Date.parse(manifest.publication.expiresAt)) && Date.parse(manifest.publication.expiresAt) > Date.now() && Date.parse(manifest.publication.generatedAt) <= Date.now();
  const canIndex = fresh && env.SEO_INDEXING_ENABLED === 'true' && manifest.indexingEnabled === true && url.origin === manifest.origin && env.SEO_EXPECTED_PUBLICATION_ID === manifest.publication.id;
  if (canonicalPath === '/robots.txt') return new Response(canIndex ? `User-agent: *\nAllow: /\nSitemap: ${manifest.origin}/sitemap.xml\n` : 'User-agent: *\nDisallow: /\n', { headers: { 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'public, max-age=300', 'X-Content-Type-Options': 'nosniff' } });
  if (canonicalPath === '/sitemap.xml' && !canIndex) return new Response('<?xml version="1.0" encoding="UTF-8"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"></urlset>', { headers: { 'Content-Type': 'application/xml; charset=utf-8', 'Cache-Control': 'no-store', 'X-Robots-Tag': 'noindex' } });
  if (canonicalPath === '/sitemap.xml') {
    const escape = (value) => String(value).replace(/[&<>"']/g, (character) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&apos;' }[character]));
    const entries = manifest.indexableRoutes.filter((entry) => !withdrawn.has(entry) && manifest.publicRoutes.includes(entry)).map((entry) => `<url><loc>${escape(manifest.origin)}${escape(entry)}</loc></url>`).join('');
    return new Response(`<?xml version="1.0" encoding="UTF-8"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${entries}</urlset>`, { headers: { 'Content-Type': 'application/xml; charset=utf-8', 'Cache-Control': 'no-cache' } });
  }
  if (canonicalPath === '/seo-manifest.json') return privateResponse(await env.ASSETS.fetch(request));
  if (manifest.indexingEnabled === true && (!fresh || env.SEO_INDEXING_ENABLED === 'true' && env.SEO_EXPECTED_PUBLICATION_ID !== manifest.publication.id)) return new Response('Catalog snapshot is awaiting an authorized refresh. Please try again later.', { status: 503, headers: { 'Content-Type': 'text/plain; charset=utf-8', 'Retry-After': '300', 'Cache-Control': 'no-store', 'X-Robots-Tag': 'noindex, nofollow, noarchive' } });
  if (!manifest.publicRoutes.includes(canonicalPath)) return privateResponse(await asset(env.ASSETS, request, '/404.html'), 404);
  if (pathname !== canonicalPath) { const target = new URL(request.url); target.pathname = canonicalPath; return Response.redirect(target, 308); }
  const response = await asset(env.ASSETS, request, manifest.routeFiles[canonicalPath]);
  if (!response.ok) return privateResponse(await asset(env.ASSETS, request, '/404.html'), 404);
  const headers = new Headers(response.headers);
  headers.set('X-Content-Type-Options', 'nosniff');
  const cacheSeconds = Math.max(0, Math.min(300, Math.floor((Date.parse(manifest.publication.expiresAt) - Date.now()) / 1000)));
  headers.set('Cache-Control', `public, max-age=0, s-maxage=${cacheSeconds}, must-revalidate`);
  if (!canIndex || url.search || !manifest.indexableRoutes.includes(canonicalPath)) headers.set('X-Robots-Tag', 'noindex, nofollow, noarchive');
  return new Response(response.body, { status: response.status, headers });
}

export async function handleSeoRequest(request, env) {
  try { return secureBrowserResponse(await routeRequest(request, env), env); }
  catch { return secureBrowserResponse(new Response('Website configuration unavailable', { status: 503, headers: { 'Cache-Control': 'no-store', 'X-Robots-Tag': 'noindex' } }), {}); }
}

export default { fetch: handleSeoRequest };
