const PRIVATE_DOCUMENT = /^\/(?:admin(?:\/|$)|cart(?:\/|$)|checkout(?:\/|$)|orders(?:\/|$)|my-orders(?:\/|$)|track-order(?:\/|$)|login(?:\/|$)|signup(?:\/|$)|forgot-password(?:\/|$)|reset-password(?:\/|$)|verify-email(?:\/|$))/;
const PRODUCT_CUSTOMIZE = /^\/products\/([a-z0-9]+(?:-[a-z0-9]+)*)\/customize$/;
const manifestCache = new WeakMap();

async function manifestFor(assets, request) {
  const cached = manifestCache.get(assets);
  if (cached && cached.expiresAt > Date.now()) return cached.value;
  try {
    const url = new URL('/seo-manifest.json', request.url);
    const response = await assets.fetch(new Request(url));
    if (!response.ok) return null;
    const value = await response.json();
    if (value.version !== 1 || !Array.isArray(value.publicRoutes) || !Array.isArray(value.productSlugs) || value.publicRoutes.length > 25_000 || value.productSlugs.length > 10_000) return null;
    manifestCache.set(assets, { value, expiresAt: Date.now() + 60_000 });
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

export async function handleSeoRequest(request, env) {
  if (!env.ASSETS?.fetch) return new Response('Website assets unavailable', { status: 503, headers: { 'Cache-Control': 'no-store', 'X-Robots-Tag': 'noindex' } });
  if (!['GET', 'HEAD'].includes(request.method)) return new Response('Method not allowed', { status: 405, headers: { Allow: 'GET, HEAD', 'Cache-Control': 'no-store', 'X-Robots-Tag': 'noindex' } });
  const url = new URL(request.url);
  const pathname = url.pathname;
  if (pathname.startsWith('/assets/') || /\.(?:webp|png|jpe?g|svg|ico|woff2?|mp4|webm|css|js)$/i.test(pathname)) return env.ASSETS.fetch(request);
  const manifest = await manifestFor(env.ASSETS, request);
  const canonicalPath = pathname === '/' ? '/' : pathname.replace(/\/+$/, '');
  const customize = PRODUCT_CUSTOMIZE.exec(canonicalPath);
  if (PRIVATE_DOCUMENT.test(canonicalPath) || customize && manifest?.productSlugs.includes(customize[1])) {
    const root = canonicalPath.split('/')[1];
    const shell = customize ? '/customize.html' : root === 'orders' ? '/my-orders.html' : `/${root}.html`;
    const response = await asset(env.ASSETS, request, shell);
    return privateResponse(response.ok ? response : await asset(env.ASSETS, request, '/index.html'));
  }
  if (canonicalPath === '/home') return Response.redirect(new URL('/', url), 308);
  if (!manifest) return privateResponse(await asset(env.ASSETS, request, '/index.html'));
  const canIndex = env.SEO_INDEXING_ENABLED === 'true' && manifest.indexingEnabled === true && url.origin === manifest.origin;
  if (canonicalPath === '/robots.txt') return new Response(canIndex ? `User-agent: *\nAllow: /\nSitemap: ${manifest.origin}/sitemap.xml\n` : 'User-agent: *\nDisallow: /\n', { headers: { 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'public, max-age=300', 'X-Content-Type-Options': 'nosniff' } });
  if (canonicalPath === '/sitemap.xml' && !canIndex) return new Response('<?xml version="1.0" encoding="UTF-8"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"></urlset>', { headers: { 'Content-Type': 'application/xml; charset=utf-8', 'Cache-Control': 'no-store', 'X-Robots-Tag': 'noindex' } });
  if (canonicalPath === '/sitemap.xml' || canonicalPath === '/seo-manifest.json') return env.ASSETS.fetch(request);
  if (!manifest.publicRoutes.includes(canonicalPath)) return privateResponse(await asset(env.ASSETS, request, '/404.html'), 404);
  if (pathname !== canonicalPath) { const target = new URL(request.url); target.pathname = canonicalPath; return Response.redirect(target, 308); }
  const response = await asset(env.ASSETS, request, canonicalPath === '/' ? '/index.html' : `${canonicalPath}.html`);
  if (!response.ok) return privateResponse(await asset(env.ASSETS, request, '/404.html'), 404);
  const headers = new Headers(response.headers);
  headers.set('X-Content-Type-Options', 'nosniff');
  headers.set('Cache-Control', 'public, max-age=0, s-maxage=300, must-revalidate');
  if (!canIndex || url.search) headers.set('X-Robots-Tag', 'noindex, nofollow, noarchive');
  return new Response(response.body, { status: response.status, headers });
}

export default { fetch: handleSeoRequest };
