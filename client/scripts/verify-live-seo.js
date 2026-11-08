import { readFile } from 'node:fs/promises';
const lock = JSON.parse(await readFile('seo-publication/lock.json', 'utf8'));
const catalog = JSON.parse(await readFile('seo-publication/catalog.json', 'utf8'));
const product = catalog.products[0];
const pathname = product.publicPath || '/products/' + product.slug;
const origin = 'https://tapandwrap.net';
async function get(path) {
  const response = await fetch(origin + path, { redirect: 'manual', signal: AbortSignal.timeout(15000), headers: { 'Cache-Control': 'no-cache' } });
  return { response, text: await response.text() };
}
const deadline = Date.now() + (process.argv.includes('--wait') ? 12 * 60000 : 1);
let verified = false;
do {
  try {
    const page = await get(pathname);
    const boot = JSON.parse(/<script[^>]+data-seo-bootstrap="true"[^>]*>(.*?)<\/script>/s.exec(page.text)?.[1] || 'null');
    if (page.response.status !== 200 || boot?.publicationId !== lock.publicationId || boot.expiresAt !== lock.expiresAt || boot.indexable !== true || /noindex/i.test(page.response.headers.get('X-Robots-Tag') || '') || !page.text.includes(`rel="canonical" href="${origin}${pathname}"`)) throw Error('Live publication mismatch');
    const robots = await get('/robots.txt'), sitemap = await get('/sitemap.xml');
    if (robots.response.status !== 200 || !robots.text.includes('Allow: /') || !robots.text.includes(origin + '/sitemap.xml') || sitemap.response.status !== 200 || !sitemap.text.includes('<sitemapindex')) throw Error('Crawl publication unavailable');
    const child = /<loc>(https:\/\/tapandwrap.net\/sitemaps\/[1-9]\d*\.xml)<\/loc>/.exec(sitemap.text)?.[1];
    if (!child) throw Error('Missing child sitemap');
    const childResult = await get(new URL(child).pathname), missing = await get('/products/release-seo-nonexistent-verified-404');
    if (childResult.response.status !== 200 || !childResult.text.includes('<urlset') || missing.response.status !== 404 || !/noindex/i.test(missing.response.headers.get('X-Robots-Tag') || '')) throw Error('Live sitemap or 404 mismatch');
    verified = true;
  } catch { if (Date.now() < deadline) await new Promise(resolve => setTimeout(resolve, 20000)); }
} while (!verified && Date.now() < deadline);
if (!verified) throw Error('Native deployment did not produce the reviewed live publication before the verification deadline. Inspect Cloudflare build activity; do not extend or bypass expiry.');
console.log(JSON.stringify({ liveVerified: true, publicationId: lock.publicationId, expiresAt: lock.expiresAt, robots: true, sitemap: true, canonical: true, notFound: true }));
