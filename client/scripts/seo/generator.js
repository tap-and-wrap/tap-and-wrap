import { mkdir, readFile, writeFile, rm, stat, realpath, rename, rmdir, copyFile } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { PUBLIC_STATIC_ROUTES, CONTENT_ROUTES, SLUG, canonicalOrigin, canonicalUrl, cleanText, publicImageUrl, productMetadata, organizationSchema, breadcrumbs, serializeJsonLd } from '../../src/seo/metadata.js';
import { verifiedMediaEntries } from '../../src/seo/media-verification.js';
import { publicationFor, comparePublications, stableDigest } from './publication.js';

export const CLIENT_DIRECTORY = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const MAX_RECORDS = 10_000;
const MAX_INPUT_BYTES = 25 * 1024 * 1024;
const PRIVATE_STATIC = ['/cart', '/checkout', '/my-orders', '/track-order', '/login', '/signup', '/admin', '/forgot-password', '/reset-password', '/verify-email'];
const OWNED_FILE = '.seo-generated-files.json';

export function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>"']/g, (character) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[character]));
}

function safePathname(value) {
  return value === '/' || typeof value === 'string' && /^\/[a-z0-9-]+(?:\/[a-z0-9-]+)*$/.test(value);
}

function money(piastres) { return `EGP ${(piastres / 100).toFixed(2)}`; }
function link(href, label) { return `<a href="${escapeHtml(href)}">${escapeHtml(label)}</a>`; }
function paragraph(value) { return `<p>${escapeHtml(cleanText(value, 10_000))}</p>`; }

function isApprovedProduct(product) {
  const gate = product?.seoEligibility;
  return gate?.status === 'ready' && gate.published === true && gate.inventoryApproved === true && gate.reviewRequired === false && gate.categoriesActive === true && product.priceApproved === true && Number.isSafeInteger(product.pricePiastres) && product.pricePiastres >= 0 && (!product.variants || Array.isArray(product.variants) && product.variants.every((variant) => variant.priceApproved !== false && variant.inventory?.approved !== false && Number.isSafeInteger(variant.pricePiastres) && variant.pricePiastres >= 0));
}

function sanitizeCategory(category, mediaOrigins) {
  return {
    _id: String(category._id), name: cleanText(category.name, 160), slug: category.slug, parentId: category.parentId ? String(category.parentId) : null, active: true,
    imageUrl: publicImageUrl(category.imageUrl, mediaOrigins), productCount: Number.isSafeInteger(category.productCount) && category.productCount >= 0 ? category.productCount : 0,
    updatedAt: validDate(category.updatedAt),
  };
}

function validDate(value) {
  if (!value || typeof value !== 'string') return null;
  const date = new Date(value);
  return Number.isNaN(date.valueOf()) ? null : date.toISOString();
}

function sanitizeProduct(product, categories, mediaOrigins, verifiedMedia) {
  const category = categories.find((entry) => entry._id === String(product.category?._id) && !entry.parentId);
  if (!category) return null;
  const subcategory = product.subcategory ? categories.find((entry) => entry._id === String(product.subcategory._id) && entry.parentId === category._id) : null;
  if (product.subcategory && !subcategory) return null;
  return {
    _id: String(product._id), name: cleanText(product.name, 160), slug: product.slug, description: cleanText(product.description, 10_000), category, subcategory,
    mainImageUrl: publicImageUrl(product.mainImageUrl, mediaOrigins), mediaVerified: Boolean(verifiedMedia.get(publicImageUrl(product.mainImageUrl, mediaOrigins))), media: verifiedMedia.get(publicImageUrl(product.mainImageUrl, mediaOrigins)) || null,
    pricePiastres: product.pricePiastres, priceApproved: true, orderingAvailable: product.orderingAvailable === true,
    compareAtPiastres: Number.isSafeInteger(product.compareAtPiastres) && product.compareAtPiastres > product.pricePiastres ? product.compareAtPiastres : null,
    inventoryMode: ['tracked', 'made_to_order'].includes(product.inventoryMode || product.inventory?.mode) ? product.inventoryMode || product.inventory.mode : null,
    variants: (product.variants || []).filter((variant) => Number.isSafeInteger(variant.pricePiastres) && variant.pricePiastres >= 0).map((variant) => ({ pricePiastres: variant.pricePiastres, orderingAvailable: variant.orderingAvailable === true, inventoryMode: ['tracked', 'made_to_order'].includes(variant.inventoryMode || variant.inventory?.mode) ? variant.inventoryMode || variant.inventory.mode : null })),
    updatedAt: validDate(product.updatedAt),
  };
}

function validateUniqueSlugs(records, type) {
  const seen = new Set();
  for (const record of records) {
    if (seen.has(record.slug)) throw new Error(`Duplicate ${type} slugs are not safe to prerender`);
    seen.add(record.slug);
  }
}

export function validateCatalog(catalog = {}, { now = new Date() } = {}) {
  if (catalog.version !== 1 || catalog.source !== 'approved-public-catalog') throw new Error('SEO input must be an explicit version-1 approved-public-catalog export');
  if (!Array.isArray(catalog.products) || !Array.isArray(catalog.categories) || catalog.products.length > MAX_RECORDS || catalog.categories.length > MAX_RECORDS) throw new Error('SEO export requires bounded product and category arrays');
  const mediaOrigins = Array.isArray(catalog.mediaOrigins) ? catalog.mediaOrigins.map(canonicalOrigin).filter(Boolean) : [];
  const verifiedMedia = verifiedMediaEntries(catalog.mediaVerification, mediaOrigins, now);
  const report = { sourceProducts: catalog.products.length, sourceCategories: catalog.categories.length, excludedProducts: [], excludedCategories: [], mediaUnverifiedProducts: [] };
  const candidateCategories = catalog.categories.filter((category, index) => {
    const valid = category?.active === true && SLUG.test(category.slug || '') && Boolean(cleanText(category.name)) && Boolean(category._id);
    if (!valid) report.excludedCategories.push({ row: index + 1, reason: 'Inactive or invalid category' });
    return valid;
  });
  const roots = new Set(candidateCategories.filter((category) => !category.parentId).map((category) => String(category._id)));
  const categories = candidateCategories.filter((category) => {
    if (!category.parentId || roots.has(String(category.parentId))) return true;
    report.excludedCategories.push({ reason: 'Subcategory has no active main category' });
    return false;
  }).map((category) => sanitizeCategory(category, mediaOrigins));
  validateUniqueSlugs(categories, 'category');
  const products = [];
  for (const [index, product] of catalog.products.entries()) {
    if (!isApprovedProduct(product) || !product._id || !SLUG.test(product.slug || '') || !cleanText(product.name)) {
      report.excludedProducts.push({ row: index + 1, reason: 'Publication, price, inventory or review eligibility is unapproved, or product identity is invalid' });
      continue;
    }
    const safeProduct = sanitizeProduct(product, categories, mediaOrigins, verifiedMedia);
    if (!safeProduct) { report.excludedProducts.push({ row: index + 1, reason: 'Product category/subcategory is inactive, absent or mismatched' }); continue; }
    if (!safeProduct.mediaVerified) report.mediaUnverifiedProducts.push({ slug: safeProduct.slug, reason: safeProduct.mainImageUrl ? 'Main image has no current approved object verification' : 'Main image is missing or unsafe' });
    products.push(safeProduct);
  }
  validateUniqueSlugs(products, 'product');
  return { products, categories, checkoutEnabled: catalog.checkoutEnabled === true, mediaOrigins, report };
}

function productCards(products, emptyMessage = 'No eligible products are included in this approved export.') {
  if (!products.length) return paragraph(emptyMessage);
  return `<ul class="seo-product-list">${products.slice(0, 20).map((product) => `<li>${product.mainImageUrl ? `<img src="${escapeHtml(product.mainImageUrl)}" alt="${escapeHtml(product.name)}" width="400" height="400" loading="lazy" decoding="async">` : ''}<h2>${link(`/products/${product.slug}`, product.name)}</h2>${paragraph(money(product.pricePiastres))}${product.category ? paragraph(product.category.name) : ''}</li>`).join('')}</ul>`;
}

function staticBody(pathname, catalog, hasCatalogExport) {
  const links = `<nav aria-label="Gift categories"><ul>${catalog.categories.filter((category) => !category.parentId).map((category) => `<li>${link(`/categories/${category.slug}`, category.name)}</li>`).join('')}</ul></nav>`;
  if (pathname === '/' || pathname === '/shop') return links + productCards(catalog.products, hasCatalogExport ? undefined : 'Development placeholder: an approved catalog export has not been provided.');
  if (pathname === '/customize') return `<ul><li>${link('/customize/gift-box', 'Build Your Gift Box')}</li><li>${link('/customize/laser-engraving', 'Laser Engraving')}</li></ul>`;
  return paragraph('Available options and approved prices are loaded from the catalog. No product or material is eligible unless explicitly configured.');
}

export function buildSeoPlan({ catalog: input, content = {}, siteOrigin, publish = false, now = new Date(), minimumCategoryProducts = 3 } = {}) {
  const origin = canonicalOrigin(siteOrigin);
  if (siteOrigin && !origin) throw new Error('SITE origin must be a canonical HTTPS origin without credentials, paths, query strings or fragments');
  if (publish && (!origin || !input)) throw new Error('Indexing requires both a canonical HTTPS origin and an explicit approved catalog export');
  if (publish && (!validDate(input.generatedAt) || Date.parse(input.generatedAt) > new Date(now).valueOf())) throw new Error('SEO source generation timestamp is required and must not be in the future');
  if (!Number.isSafeInteger(minimumCategoryProducts) || minimumCategoryProducts < 1 || minimumCategoryProducts > 20) throw new Error('SEO category minimum must be an integer from 1 to 20');
  const catalog = input ? validateCatalog(input, { now }) : { products: [], categories: [], checkoutEnabled: false, report: { sourceProducts: 0, sourceCategories: 0, excludedProducts: [], excludedCategories: [], mediaUnverifiedProducts: [] } };
  const routes = new Map();
  const add = (pathname, route) => routes.set(pathname, { pathname, indexable: publish && Boolean(origin), ...route });
  for (const [pathname, definition] of Object.entries(PUBLIC_STATIC_ROUTES)) {
    const organization = pathname === '/' ? organizationSchema(origin) : null;
    add(pathname, { title: definition.title, description: definition.description, heading: definition.heading, body: staticBody(pathname, catalog, Boolean(input)), structuredData: organization ? [organization] : [] });
  }
  for (const pathname of CONTENT_ROUTES) {
    const supplied = content.routes?.[pathname];
    const approved = supplied?.approved === true && cleanText(supplied.title) && cleanText(supplied.description) && cleanText(supplied.heading) && Array.isArray(supplied.paragraphs) && supplied.paragraphs.length > 0 && supplied.paragraphs.length <= 100 && supplied.paragraphs.every((value) => typeof value === 'string' && cleanText(value, 10_000));
    const label = pathname.slice(1).split('-').map((part) => `${part[0].toUpperCase()}${part.slice(1)}`).join(' ');
    add(pathname, approved ? { title: `${cleanText(supplied.title, 120)} | Tap & Wrap`, description: cleanText(supplied.description), heading: cleanText(supplied.heading), body: supplied.paragraphs.map(paragraph).join(''), updatedAt: validDate(supplied.updatedAt), structuredData: [] } : { title: `${label} | Tap & Wrap`, description: `${label} content is awaiting owner approval.`, heading: label, body: paragraph('Development placeholder: owner-approved information is not yet available.'), indexable: false, structuredData: [] });
  }
  for (const category of catalog.categories) {
    const products = catalog.products.filter((product) => product.category._id === category._id || product.subcategory?._id === category._id);
    // Counts from an export are descriptive, not an indexing assertion. Recount
    // this exact eligible snapshot, including independently verified photos.
    const indexableCount = products.filter((product) => product.mediaVerified).length;
    const children = catalog.categories.filter((child) => child.parentId === category._id);
    const parent = category.parentId ? catalog.categories.find((entry) => entry._id === category.parentId) : null;
    const crumb = breadcrumbs(origin, [{ name: 'Home', pathname: '/' }, { name: 'Shop', pathname: '/shop' }, ...(parent ? [{ name: parent.name, pathname: `/categories/${parent.slug}` }] : []), { name: category.name, pathname: `/categories/${category.slug}` }]);
    add(`/categories/${category.slug}`, { title: `${category.name} Gifts | Tap & Wrap`, description: `Browse approved ${category.name} products from Tap & Wrap.`, heading: `${category.name} Gifts`, imageUrl: category.imageUrl, body: `${parent ? `<nav aria-label="Parent category">${link(`/categories/${parent.slug}`, parent.name)}</nav>` : ''}${children.length ? `<nav aria-label="Subcategories">${children.map((child) => link(`/categories/${child.slug}`, child.name)).join(' ')}</nav>` : ''}${productCards(products)}${products.length > 20 ? paragraph('Use the shop filters and pagination to explore more products in this category.') + link(`/shop?category=${category.slug}`, 'View all products in this category') : ''}`, structuredData: crumb ? [crumb] : [], updatedAt: category.updatedAt });
    routes.get(`/categories/${category.slug}`).indexable = publish && Boolean(origin) && indexableCount >= minimumCategoryProducts;
    routes.get(`/categories/${category.slug}`).minimumCategoryProducts = minimumCategoryProducts;
  }
  for (const product of catalog.products) {
    const metadata = productMetadata(product, origin, { indexable: publish, checkoutEnabled: catalog.checkoutEnabled, mediaOrigins: catalog.mediaOrigins, mediaVerified: product.mediaVerified });
    metadata.sourceFingerprint = stableDigest(product);
    metadata.imageDimensions = product.media ? { width: product.media.width, height: product.media.height } : null;
    add(metadata.pathname, { ...metadata, heading: product.name, updatedAt: product.updatedAt, body: `${product.mainImageUrl ? `<img src="${escapeHtml(product.mainImageUrl)}" alt="${escapeHtml(product.name)}" width="900" height="900" decoding="async">` : ''}${paragraph(money(product.pricePiastres))}${product.variants.length ? paragraph(`Configured variant prices: ${[...new Set(product.variants.map((variant) => money(variant.pricePiastres)))].join(', ')}.`) : ''}${product.compareAtPiastres ? `<p>Compare-at price: <del>${escapeHtml(money(product.compareAtPiastres))}</del></p>` : ''}${paragraph(product.description)}${link(`/categories/${product.category.slug}`, product.category.name)}${product.subcategory ? ` ${link(`/categories/${product.subcategory.slug}`, product.subcategory.name)}` : ''}${paragraph(catalog.checkoutEnabled ? product.orderingAvailable ? 'Ordering options are available in the product form.' : 'Currently unavailable for ordering.' : 'Checkout is currently disabled.')}` });
  }
  for (const pathname of PRIVATE_STATIC) add(pathname, { title: 'Your Tap & Wrap account', heading: 'Tap & Wrap', description: '', body: paragraph('This page requires the interactive application. Private information is never included in this HTML.'), indexable: false, structuredData: [] });
  add('/404', { title: 'Page not found | Tap & Wrap', heading: 'Page not found', description: 'This page is not available.', body: paragraph('This page is not available.') + link('/shop', 'Browse the shop'), indexable: false, structuredData: [] });
  return { origin, routes, catalog, sourceGeneratedAt: input?.generatedAt || null, report: { ...catalog.report, approvedProducts: catalog.products.length, activeCategories: catalog.categories.length, generatedRoutes: routes.size, indexableRoutes: [...routes.values()].filter((route) => route.indexable).length, indexingEnabled: publish && Boolean(origin), checkoutOffersEnabled: catalog.checkoutEnabled, minimumCategoryProducts, nonindexableCategorySlugs: catalog.categories.filter((category) => !routes.get(`/categories/${category.slug}`).indexable).map((category) => category.slug), approvedContentRoutes: CONTENT_ROUTES.filter((pathname) => routes.get(pathname).indexable), ownerContentMissing: CONTENT_ROUTES.filter((pathname) => !routes.get(pathname).indexable) } };
}

function headMarkup(route, origin) {
  const canonical = canonicalUrl(origin, route.pathname);
  const image = publicImageUrl(route.imageUrl);
  const type = route.structuredData?.some((entry) => entry['@type'] === 'Product') ? 'product' : 'website';
  const tags = [`<title>${escapeHtml(route.title)}</title>`, `<meta name="description" content="${escapeHtml(cleanText(route.description))}">`, `<meta name="robots" content="${route.indexable ? 'index, follow, max-image-preview:large' : 'noindex, nofollow, noarchive'}">`, `<meta property="og:site_name" content="Tap &amp; Wrap">`, `<meta property="og:type" content="${type}">`, `<meta property="og:title" content="${escapeHtml(route.title)}">`, `<meta property="og:description" content="${escapeHtml(cleanText(route.description))}">`, `<meta name="twitter:card" content="${image ? 'summary_large_image' : 'summary'}">`, `<meta name="twitter:title" content="${escapeHtml(route.title)}">`, `<meta name="twitter:description" content="${escapeHtml(cleanText(route.description))}">`];
  if (canonical) tags.push(`<link rel="canonical" href="${escapeHtml(canonical)}">`, `<meta property="og:url" content="${escapeHtml(canonical)}">`);
  if (image) tags.push(`<meta property="og:image" content="${escapeHtml(image)}">`, `<meta name="twitter:image" content="${escapeHtml(image)}">`);
  if (route.indexable && route.structuredData?.length) tags.push(`<script type="application/ld+json" data-seo-jsonld="true">${serializeJsonLd(route.structuredData)}</script>`);
  return tags.join('\n    ');
}

export function renderRouteHtml(template, route, origin, publication) {
  if (!/<div\s+id=["']root["']\s*>[\s\S]*?<\/div>/i.test(template)) throw new Error('Vite HTML template does not contain the expected root element');
  let html = template.replace(/<title>[\s\S]*?<\/title>/gi, '').replace(/<meta\b[^>]*(?:name=["'](?:description|robots|twitter:[^"']+)["']|property=["']og:[^"']+["'])[^>]*>/gi, '').replace(/<link\b[^>]*rel=["']canonical["'][^>]*>/gi, '').replace(/<link\b[^>]*href=["']\/seo-static\.css["'][^>]*>/gi, '').replace(/<script\b[^>]*type=["']application\/ld\+json["'][^>]*>[\s\S]*?<\/script>/gi, '');
  html = html.replace(/<script\b[^>]*data-seo-bootstrap[^>]*>[\s\S]*?<\/script>/gi, '');
  const boot = publication ? `<script type="application/json" data-seo-bootstrap="true">${serializeJsonLd({ version: 1, pathname: route.pathname, origin, indexable: route.indexable === true, publicationId: publication.id, expiresAt: publication.expiresAt, productSignature: route.productSignature || null, minimumCategoryProducts: route.minimumCategoryProducts || null })}</script>` : '';
  if (route.imageDimensions) route = { ...route, body: route.body?.replace('width="900" height="900"', `width="${route.imageDimensions.width}" height="${route.imageDimensions.height}"`) };
  html = html.replace('</head>', `    <link rel="stylesheet" href="/seo-static.css">\n    ${headMarkup(route, origin)}\n    ${boot}\n  </head>`);
  const body = `<header class="seo-static-header"><a href="/" aria-label="Tap &amp; Wrap home"><img src="/tap-wrap-logo.webp" alt="Tap &amp; Wrap" width="2000" height="667"></a><nav aria-label="Main navigation">${link('/', 'Home')} ${link('/shop', 'Shop')} ${link('/customize', 'Customize')} ${link('/about', 'About Us')}</nav></header><main class="page-shell" data-prerender="true"><h1>${escapeHtml(route.heading)}</h1>${route.body || ''}</main><footer class="seo-static-footer">${CONTENT_ROUTES.map((pathname) => link(pathname, pathname.slice(1).replaceAll('-', ' '))).join(' ')}</footer>`;
  return html.replace(/<div\s+id=["']root["']\s*>[\s\S]*?<\/div>/i, `<div id="root">${body}</div>`);
}

export function sitemapXml(plan) {
  const items = [...plan.routes.values()].filter((route) => route.indexable).map((route) => `<url><loc>${escapeHtml(canonicalUrl(plan.origin, route.pathname))}</loc>${route.updatedAt ? `<lastmod>${route.updatedAt}</lastmod>` : ''}</url>`);
  return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${items.join('')}</urlset>\n`;
}

export function robotsText(plan) {
  if (!plan.report.indexingEnabled) return 'User-agent: *\nDisallow: /\n';
  return `User-agent: *\nAllow: /\n# Authentication and noindex headers protect private pages; robots.txt is not authorization.\nSitemap: ${plan.origin}/sitemap.xml\n`;
}

function inside(parent, child) { const relative = path.relative(parent, child); return relative !== '' && !relative.startsWith('..') && !path.isAbsolute(relative); }

async function assertRealLocation(parent, target) {
  const realParent = await realpath(parent);
  let existing = target;
  for (;;) {
    try {
      const resolved = await realpath(existing);
      if (resolved !== realParent && !inside(realParent, resolved)) throw new Error('SEO output/input resolves outside its allowed directory');
      return;
    } catch (error) {
      if (error.code !== 'ENOENT') throw error;
      const ancestor = path.dirname(existing);
      if (ancestor === existing) throw new Error('SEO output/input has no safe directory');
      existing = ancestor;
    }
  }
}

export async function readJsonInput(inputPath, workspaceDirectory = path.resolve(CLIENT_DIRECTORY, '..')) {
  const resolved = path.resolve(workspaceDirectory, inputPath);
  if (!inside(workspaceDirectory, resolved)) throw new Error('SEO input must remain within the Tap & Wrap project');
  await assertRealLocation(workspaceDirectory, resolved);
  const file = await stat(resolved);
  if (!file.isFile() || file.size > MAX_INPUT_BYTES) throw new Error('SEO JSON input exceeds the allowed size');
  return JSON.parse(await readFile(resolved, 'utf8'));
}

async function atomicWrite(destination, contents) {
  const temporary = `${destination}.${randomUUID()}.tmp`;
  try { await writeFile(temporary, contents, { encoding: 'utf8', flag: 'wx' }); await rename(temporary, destination); }
  finally { await rm(temporary, { force: true }); }
}

async function atomicCopy(source, destination) {
  const temporary = `${destination}.${randomUUID()}.tmp`;
  try { await copyFile(source, temporary); await rename(temporary, destination); }
  finally { await rm(temporary, { force: true }); }
}

export async function writeSeoOutput({ outputDirectory = path.join(CLIENT_DIRECTORY, 'dist'), template, maximumAgeSeconds = 3600, beforeLock, beforeCommit, afterCommit, ...options } = {}) {
  const resolvedOutput = path.resolve(outputDirectory);
  if (!inside(CLIENT_DIRECTORY, resolvedOutput)) throw new Error('SEO output must remain within the client project');
  await assertRealLocation(CLIENT_DIRECTORY, resolvedOutput);
  const plan = buildSeoPlan(options);
  const publication = publicationFor(plan, { now: options.now, maximumAgeSeconds });
  if (!template) await assertRealLocation(resolvedOutput, path.join(resolvedOutput, 'index.html'));
  const htmlTemplate = template || await readFile(path.join(resolvedOutput, 'index.html'), 'utf8');
  await mkdir(resolvedOutput, { recursive: true });
  const lock = path.join(resolvedOutput, '.seo-generation.lock');
  await assertRealLocation(resolvedOutput, lock);
  if (beforeLock) await beforeLock();
  try { await mkdir(lock); } catch (error) { if (error.code === 'EEXIST') throw new Error('SEO generation is already running; inspect the local lock before retrying'); throw error; }
  const files = [], routeFiles = {}, prepared = [];
  const generationDirectory = path.join(resolvedOutput, 'seo-pages', publication.id);
  let committed = false;
  try {
  // Baselines belong to the same lock as the commit. Reading them before lock
  // acquisition can miss a publication that another writer completes meanwhile,
  // making the withdrawal journal and compatibility cleanup inaccurate.
  let oldFiles = [];
  try { await assertRealLocation(resolvedOutput, path.join(resolvedOutput, OWNED_FILE)); oldFiles = JSON.parse(await readFile(path.join(resolvedOutput, OWNED_FILE), 'utf8')); } catch (error) { if (error.code !== 'ENOENT') throw new Error('Existing SEO output manifest is invalid'); }
  if (!Array.isArray(oldFiles) || oldFiles.some((file) => typeof file !== 'string' || /(?:^|\/)\.\.(?:\/|$)/.test(file) || path.isAbsolute(file))) throw new Error('SEO cleanup manifest contains an unsafe path');
  if (oldFiles.length > 100_000 || oldFiles.some((file) => !/^(?:seo-pages\/[a-f0-9]{64}\/)?(?:[a-z0-9-]+\/)*[a-z0-9-]+\.html$/.test(file))) throw new Error('SEO cleanup manifest contains an unowned file');
  let previous;
  try { await assertRealLocation(resolvedOutput, path.join(resolvedOutput, 'seo-manifest.json')); previous = JSON.parse(await readFile(path.join(resolvedOutput, 'seo-manifest.json'), 'utf8')); } catch (error) { if (error.code !== 'ENOENT') throw new Error('Existing SEO publication manifest is invalid'); }
  await assertRealLocation(resolvedOutput, generationDirectory);
  for (const route of plan.routes.values()) {
    if (!safePathname(route.pathname)) throw new Error('Unsafe SEO route');
    const filename = route.pathname === '/' ? 'index.html' : `${route.pathname.slice(1)}.html`;
    const destination = path.join(resolvedOutput, filename);
    await assertRealLocation(resolvedOutput, destination);
    await mkdir(path.dirname(destination), { recursive: true });
    const generatedFilename = `seo-pages/${publication.id}/${filename}`;
    const generatedDestination = path.join(resolvedOutput, generatedFilename);
    await assertRealLocation(resolvedOutput, generatedDestination);
    await mkdir(path.dirname(generatedDestination), { recursive: true });
    const html = renderRouteHtml(htmlTemplate, route, plan.origin, publication);
    await atomicWrite(generatedDestination, html);
    routeFiles[route.pathname] = `/${generatedFilename}`;
    prepared.push({ destination, generatedDestination });
    files.push(filename);
    files.push(generatedFilename);
  }
  const changeReport = comparePublications(previous?.publication, publication);
  const manifest = { version: 2, origin: plan.origin, indexingEnabled: plan.report.indexingEnabled, publicRoutes: [...plan.routes.values()].filter((route) => route.indexable || !PRIVATE_STATIC.includes(route.pathname) && route.pathname !== '/404').map((route) => route.pathname), indexableRoutes: [...plan.routes.values()].filter((route) => route.indexable).map((route) => route.pathname), productSlugs: plan.catalog.products.map((product) => product.slug), categorySlugs: plan.catalog.categories.map((category) => category.slug), routeFiles, publication };
  for (const file of ['sitemap.xml', 'robots.txt', 'seo-manifest.json', 'seo-change-report.json', OWNED_FILE, '.assetsignore']) await assertRealLocation(resolvedOutput, path.join(resolvedOutput, file));
  // No deploy happens here. Worker-visible publication switches only after every
  // immutable document is ready; interrupted preparation leaves the old manifest.
  if (beforeCommit) await beforeCommit({ manifest, changeReport });
  await atomicWrite(path.join(resolvedOutput, 'seo-manifest.json'), `${JSON.stringify(manifest)}\n`);
  committed = true;
  if (afterCommit) await afterCommit({ manifest, changeReport });
  // Human preview/other static hosts still get canonical flat files. The Worker
  // uses immutable routeFiles, so these compatibility writes cannot mix versions.
  for (const item of prepared) await atomicCopy(item.generatedDestination, item.destination);
  for (const file of oldFiles) {
    const destination = path.resolve(resolvedOutput, file);
    if (!inside(resolvedOutput, destination)) throw new Error('Unsafe previous SEO output path');
    await assertRealLocation(resolvedOutput, destination);
    if (!files.includes(file)) await rm(destination, { force: true });
  }
  await atomicWrite(path.join(resolvedOutput, 'sitemap.xml'), sitemapXml(plan));
  await atomicWrite(path.join(resolvedOutput, 'robots.txt'), robotsText(plan));
  await atomicWrite(path.join(resolvedOutput, 'seo-change-report.json'), `${JSON.stringify({ version: 1, previousPublicationId: previous?.publication?.id || null, publicationId: publication.id, ...changeReport })}\n`);
  await atomicWrite(path.join(resolvedOutput, OWNED_FILE), `${JSON.stringify(files)}\n`);
  await atomicWrite(path.join(resolvedOutput, '.assetsignore'), `${OWNED_FILE}\n.assetsignore\n.seo-generation.lock\nseo-change-report.json\n*.tmp\n`);
  return { ...plan.report, publicationId: publication.id, expiresAt: publication.expiresAt, changes: changeReport };
  } catch (error) {
    if (!committed) throw error;
    const failure = new Error('SEO publication committed but output finalization failed; inspect the local manifest and rebuild before deployment');
    failure.code = 'SEO_OUTPUT_FINALIZATION_FAILED';
    failure.publicationCommitted = true;
    failure.publicationId = publication.id;
    throw failure;
  } finally { await rmdir(lock); }
}
