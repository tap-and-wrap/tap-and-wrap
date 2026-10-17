import { secureBrowserResponse } from './browser-policy.js';
import { validateAddressResolution } from '../../shared/product-url-compatibility.mjs';

const PRIVATE_DOCUMENT = /^\/(?:admin(?:\/|$)|cart(?:\/|$)|checkout(?:\/|$)|orders(?:\/|$)|my-orders(?:\/|$)|track-order(?:\/|$)|login(?:\/|$)|signup(?:\/|$)|forgot-password(?:\/|$)|reset-password(?:\/|$)|verify-email(?:\/|$))/;
const PRODUCT_CUSTOMIZE = /^\/products\/([a-z0-9]+(?:-[a-z0-9]+)*)\/customize$/;

async function manifestFor(assets, request) {
  try {
    const url = new URL('/seo-manifest.json', request.url);
    const response = await assets.fetch(new Request(url));
    if (!response.ok) return null;
    const value = await response.json();
    if (value.origin !== null) { const origin = new URL(value.origin); if (origin.protocol !== 'https:' || origin.origin !== value.origin || origin.username || origin.password) return null; }
    if (value.version !== 2 || !Array.isArray(value.publicRoutes) || !Array.isArray(value.indexableRoutes) || !Array.isArray(value.productSlugs) || value.publicRoutes.length > 25_000 || value.productSlugs.length > 10_000 || !/^[a-f0-9]{64}$/.test(value.publication?.id || '') || !value.routeFiles || !Array.isArray(value.publication.routes)) return null;
    if (value.publication.version !== 1 || !Number.isSafeInteger(value.publication.maximumAgeSeconds) || value.publication.maximumAgeSeconds < 60 || value.publication.maximumAgeSeconds > 86400 || Date.parse(value.publication.expiresAt) - Date.parse(value.publication.generatedAt) > value.publication.maximumAgeSeconds * 1000) return null;
    if (value.publicRoutes.some((pathname) => typeof pathname !== 'string' || !/^\/(?:[a-z0-9-]+(?:\/[a-z0-9-]+)*)?$/.test(pathname) || !value.routeFiles[pathname]) || value.indexableRoutes.some((pathname) => !value.publicRoutes.includes(pathname))) return null;
    if (Object.values(value.routeFiles).some((file) => typeof file !== 'string' || !new RegExp(`^/seo-pages/${value.publication.id}/(?:[a-z0-9-]+/)*[a-z0-9-]+\\.html$`).test(file))) return null;
    if (value.categoryRedirects && (typeof value.categoryRedirects !== 'object' || Array.isArray(value.categoryRedirects) || Object.keys(value.categoryRedirects).length > 10_000 || Object.entries(value.categoryRedirects).some(([from, to]) => !/^\/categories\/[a-z0-9]+(?:-[a-z0-9]+)*$/.test(from) || !/^\/categories\/[a-z0-9]+(?:-[a-z0-9]+)*(?:\/[a-z0-9]+(?:-[a-z0-9]+)*)?$/.test(to) || !value.publicRoutes.includes(to) || value.publicRoutes.includes(from)))) return null;
    if (value.productRedirects && (typeof value.productRedirects !== 'object' || Array.isArray(value.productRedirects) || Object.keys(value.productRedirects).length > 100_000 || Object.entries(value.productRedirects).some(([from,to]) => !/^\/products\/[a-z0-9]+(?:-[a-z0-9]+)*$/.test(from) || !/^\/products\/[a-z0-9]+(?:-[a-z0-9]+)*$/.test(to) || !value.publicRoutes.includes(to) || value.publicRoutes.includes(from)))) return null;
    return value; // Old prelaunch maps are archival evidence, never runtime authority.
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
  const headers = new Headers(); headers.set('Accept-Encoding', 'identity');
  return assets.fetch(new Request(url, { method: request.method, headers }));
}

function withdrawalPaths(value) {
  if (!value) return new Set();
  if (typeof value !== 'string' || value.length > 50000) throw new Error('Invalid withdrawal configuration');
  const values = value.split(',').map((entry) => entry.trim());
  if (values.length > 500 || values.some((entry) => !/^\/(?:products\/[a-z0-9]+(?:-[a-z0-9]+)*|categories\/[a-z0-9]+(?:-[a-z0-9]+)*(?:\/[a-z0-9]+(?:-[a-z0-9]+)*)?)$/.test(entry))) throw new Error('Invalid withdrawal configuration');
  return new Set(values);
}

async function resolveAddresses(env, paths, timeoutMs = 4000) {
  if (!paths.length) return new Map();
  const origin = new URL(env.PRODUCT_ADDRESS_API_ORIGIN || 'https://api.tapandwrap.net');
  if (origin.protocol !== 'https:' || origin.origin !== (env.PRODUCT_ADDRESS_API_ORIGIN || 'https://api.tapandwrap.net') || origin.username || origin.password) throw new Error('Invalid address authority');
  const url = new URL('/api/v1/public/product-addresses', origin);
  url.searchParams.set('slugs', paths.map(path => path.slice('/products/'.length)).join(','));
  const controller = new AbortController(), timer = setTimeout(() => controller.abort(), Math.max(1, Math.min(4000, timeoutMs)));
  try {
    // Zero positive/negative cache TTL: no stale visibility or ownership grants.
    // No visitor headers, cookies, query strings or credentials leave the Worker.
    const options = { signal: controller.signal, redirect: 'error', cache: 'no-store', cf: { cacheTtlByStatus: { '100-599': -1 } } };
    const response = await (env.ADDRESS_SERVICE ? env.ADDRESS_SERVICE.fetch(url.href, options) : fetch(url.href, options));
    if (!response.ok) throw new Error('Address authority unavailable');
    if (Number(response.headers.get('Age')) > 0 || /^(?:HIT|STALE|UPDATING)$/i.test(response.headers.get('CF-Cache-Status') || '')) throw new Error('Cached address authority rejected');
    const reader = response.body.getReader(); let bytes = 0, text = ''; const decoder = new TextDecoder();
    try { for (;;) { const chunk = await reader.read(); if (chunk.done) break; bytes += chunk.value.length; if (bytes > 16000) throw new Error('Address response too large'); text += decoder.decode(chunk.value, { stream: true }); } }
    finally { await reader.cancel(); }
    const value = JSON.parse(text + decoder.decode());
    if (value.ok !== true) throw new Error('Invalid address authority');
    return validateAddressResolution(value.data, paths);
  } finally { clearTimeout(timer); controller.abort(); }
}

function currentSnapshot(manifest, resolution, path) {
  return resolution && resolution.canonicalPath === path && resolution.seoSignature && manifest?.productSignatures?.[path] === resolution.seoSignature;
}

async function resolvePublicPaths(env, paths, withdrawn) {
  const blocked = [...withdrawn].filter(path => /^\/products\/[a-z0-9]+(?:-[a-z0-9]+)*$/.test(path));
  const all = [...new Set([...paths, ...blocked])], resolved = new Map(), deadline = Date.now() + 4000;
  for (let offset = 0; offset < all.length; offset += 20) {
    if (Date.now() >= deadline) throw new Error('Address verification deadline');
    for (const [path, value] of await resolveAddresses(env, all.slice(offset, offset + 20), deadline - Date.now())) resolved.set(path, value);
  }
  for (const path of blocked) if (resolved.get(path)) withdrawn.add(resolved.get(path).canonicalPath);
  return resolved;
}

async function routeRequest(request, env) {
  if (!env.ASSETS?.fetch) throw new Error('Missing assets');
  if (!['GET', 'HEAD'].includes(request.method)) return new Response('Method not allowed', { status: 405, headers: { Allow: 'GET, HEAD', 'Cache-Control': 'no-store', 'X-Robots-Tag': 'noindex' } });
  const url = new URL(request.url), pathname = url.pathname;
  if (pathname.startsWith('/assets/') || /\.(?:webp|png|jpe?g|svg|ico|woff2?|mp4|webm|css|js)$/i.test(pathname)) return env.ASSETS.fetch(request);
  const manifest = await manifestFor(env.ASSETS, request);
  const path = pathname === '/' ? '/' : pathname.replace(/\/+$/, '');
  const withdrawn = withdrawalPaths(env.SEO_WITHDRAWN_PATHS);
  for (const [from, to] of Object.entries(manifest?.categoryRedirects || {})) if (withdrawn.has(from)) withdrawn.add(to);
  const missing = async () => privateResponse(await asset(env.ASSETS, request, '/404.html'), 404);
  const shell = async canonical => {
    const response = await asset(env.ASSETS, request, '/spa.html'); if (!response.ok) throw new Error('Missing React shell');
    if (!canonical) return privateResponse(response);
    const href = new URL(canonical, manifest?.origin || url.origin).href;
    const headers = new Headers(response.headers); headers.set('Link', `<${href}>; rel="canonical"`);
    for (const name of ['Content-Length', 'Content-Encoding', 'ETag', 'Last-Modified']) headers.delete(name);
    return privateResponse(new Response((await response.text()).replace('</head>', `<link rel="canonical" href="${href}"></head>`), { headers }));
  };
  const redirect = targetPath => { const target = new URL(request.url); target.pathname = targetPath; return new Response(null, { status: 308, headers: { Location: target.href, 'Cache-Control': 'no-store', 'X-Robots-Tag': 'noindex' } }); };
  if (withdrawn.has(path) || /^\/(?:seo-pages|spa.html)(?:\/|$)/.test(path)) return missing();
  const fresh = manifest && Date.parse(manifest.publication.expiresAt) > Date.now() && Date.parse(manifest.publication.generatedAt) <= Date.now();
  const canIndex = fresh && env.SEO_INDEXING_ENABLED === 'true' && manifest.indexingEnabled === true && url.origin === manifest.origin && env.SEO_EXPECTED_PUBLICATION_ID === manifest.publication.id;
  const customize = PRODUCT_CUSTOMIZE.exec(path), product = /^\/products\/([a-z0-9]+(?:-[a-z0-9]+)*)$/.exec(path);
  if (product || customize) {
    const productPath = '/products/' + (product || customize)[1];
    if (productPath.length > 310) return missing();
    const resolution = (await resolvePublicPaths(env, [productPath], withdrawn)).get(productPath);
    if (!resolution || withdrawn.has(resolution.canonicalPath)) return missing();
    if (resolution.canonicalPath !== productPath || pathname !== path) return redirect(resolution.canonicalPath + (customize ? '/customize' : ''));
    if (customize) return shell();
    if (!canIndex || !manifest.indexableRoutes.includes(path) || !currentSnapshot(manifest, resolution, path)) return shell(resolution.canonicalPath);
    const response = await asset(env.ASSETS, request, manifest.routeFiles[path]);
    if (!response.ok) return shell(resolution.canonicalPath);
    const headers = new Headers(response.headers); headers.set('Cache-Control', 'private, no-store');
    if (url.search) headers.set('X-Robots-Tag', 'noindex, nofollow, noarchive');
    return new Response(response.body, { status: 200, headers });
  }
  if (PRIVATE_DOCUMENT.test(path)) return shell();
  if (path === '/home') return redirect('/');
  if (path === '/robots.txt') return new Response(canIndex ? 'User-agent: *\nAllow: /\nSitemap: ' + manifest.origin + '/sitemap.xml\n' : 'User-agent: *\nDisallow: /\n', { headers: { 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'no-store' } });
  const sitemapPage = /^\/sitemaps\/([1-9]\d{0,3})\.xml$/.exec(path);
  if (path === '/sitemap.xml' || sitemapPage) {
    const routes = canIndex ? manifest.indexableRoutes.filter(p => !withdrawn.has(p) && manifest.publicRoutes.includes(p)) : [];
    const escape = value => value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/"/g, '&quot;');
    const headers = { 'Content-Type': 'application/xml; charset=utf-8', 'Cache-Control': 'no-store', 'X-Robots-Tag': 'noindex' };
    if (!sitemapPage && canIndex) {
      const pages = Array.from({ length: Math.ceil(routes.length / 20) }, (_, index) => '<sitemap><loc>' + escape(manifest.origin + '/sitemaps/' + (index + 1) + '.xml') + '</loc></sitemap>').join('');
      return new Response('<?xml version="1.0" encoding="UTF-8"?><sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">' + pages + '</sitemapindex>', { headers });
    }
    const page = sitemapPage ? Number(sitemapPage[1]) : 1;
    if (canIndex && page > Math.ceil(routes.length / 20)) return missing();
    const entries = routes.slice((page - 1) * 20, page * 20), dependencies = new Set();
    for (const p of entries) {
      if (p.startsWith('/products/')) dependencies.add(p);
      else if (p === '/' || p === '/shop' || p.startsWith('/categories/')) {
        const paths = manifest.routeProducts?.[p];
        if (Array.isArray(paths) && paths.length <= 20) for (const path of paths) dependencies.add(path);
      }
    }
    // At most 20 entries / 400 dependencies, plus the separately bounded
    // emergency list (maximum 500). All checks share one four-second deadline.
    // Failed validation returns a retriable 503 for this sitemap only, never stale URLs.
    const resolved = await resolvePublicPaths(env, [...dependencies], withdrawn);
    const valid = entries.filter(p => {
      if (withdrawn.has(p)) return false;
      if (p.startsWith('/products/')) return currentSnapshot(manifest,resolved.get(p),p);
      if (p === '/' || p === '/shop' || p.startsWith('/categories/')) {
        const paths = manifest.routeProducts?.[p];
        return Array.isArray(paths) && paths.length <= 20 && paths.every(path => !withdrawn.has(path) && currentSnapshot(manifest,resolved.get(path),path));
      }
      return true;
    });
    return new Response('<?xml version="1.0" encoding="UTF-8"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">' + valid.map(p => '<url><loc>' + escape(manifest.origin+p) + '</loc></url>').join('') + '</urlset>', { headers });
  }
  if (path === '/seo-manifest.json') return privateResponse(new Response('Not found', { status: 404 }));
  const target = manifest?.categoryRedirects?.[path];
  if (target) return withdrawn.has(target) ? missing() : redirect(target);
  const catalogPage = path === '/' || path === '/shop' || /^\/categories\/[a-z0-9-]+(?:\/[a-z0-9-]+)?$/.test(path);
  if (!manifest) return catalogPage ? shell() : missing();
  if (!manifest.publicRoutes.includes(path)) return /^\/categories\/[a-z0-9-]+(?:\/[a-z0-9-]+)?$/.test(path) ? shell() : missing();
  if (pathname !== path) return redirect(path);
  // Expired/unreviewed publications affect indexing, never public browse access.
  if (!fresh || manifest.indexingEnabled && !canIndex) return shell();
  const dependencies = manifest.routeProducts?.[path];
  if (catalogPage) {
    if (!canIndex || !Array.isArray(dependencies) || dependencies.length > 20) return shell();
    const resolved = await resolvePublicPaths(env, dependencies, withdrawn);
    if (dependencies.some(p => withdrawn.has(p) || !currentSnapshot(manifest, resolved.get(p), p))) return shell();
  }
  const response = await asset(env.ASSETS, request, manifest.routeFiles[path]);
  if (!response.ok) return shell();
  const headers = new Headers(response.headers); headers.set('Cache-Control', 'private, no-store');
  if (!canIndex || url.search || !manifest.indexableRoutes.includes(path)) headers.set('X-Robots-Tag', 'noindex, nofollow, noarchive');
  return new Response(response.body, { status: 200, headers });
}

export async function handleSeoRequest(request, env) {
  let response;
  try { response = secureBrowserResponse(await routeRequest(request, env), env); }
  catch { response = secureBrowserResponse(new Response('Website temporarily unavailable. Please try again shortly.', { status: 503, headers: { 'Cache-Control': 'no-store', 'X-Robots-Tag': 'noindex', 'Retry-After': '30' } }), {}); }
  return request.method === 'HEAD' ? new Response(null, { status: response.status, headers: response.headers }) : response;
}

export default { fetch: handleSeoRequest };
