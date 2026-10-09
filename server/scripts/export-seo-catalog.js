import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { realpath, mkdir, writeFile, rename, unlink } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import { validateDatabaseUri, assertConnectedDatabase, databaseDiagnostic } from '../src/config/database-safety.js';
import { publicProductFilter } from '../src/catalog/product-policy.js';
import { mediaUrlForKey, productCanOrder } from '../src/catalog/public-presentation.js';
import { verifiedMediaEntries, MEDIA_VERIFICATION_SOURCE } from '../../client/src/seo/media-verification.js';

export const SEO_PROJECT_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
export const SEO_PAGE_SIZE = 20;
export const SEO_MAX_PAGES = 200;
const SLUG = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const PRODUCT_FIELDS = { _id: 1, name: 1, slug: 1, description: 1, categoryId: 1, subcategoryId: 1, mainImageKey: 1, pricePiastres: 1, compareAtPiastres: 1, priceApproved: 1, status: 1, published: 1, reviewRequired: 1, inventory: 1, variants: 1, updatedAt: 1 };
const CATEGORY_FIELDS = { _id: 1, name: 1, slug: 1, parentId: 1, imageKey: 1, active: 1, updatedAt: 1 };
const CONTENT_FIELDS = { about: 1, contact: 1, privacyPolicy: 1, refundPolicy: 1, shippingPolicy: 1, termsOfService: 1 };

export function parseSeoExportArguments(argv) {
  const options = { confirmRead: false, dryRun: false, target: null, output: null, contentOutput: null };
  const seen = new Set();
  const values = new Map([['--target', 'target'], ['--output', 'output'], ['--content-output', 'contentOutput'], ['--media-verification', 'mediaVerification']]);
  for (let index = 0; index < argv.length; index += 1) {
    const flag = argv[index];
    if (seen.has(flag)) throw new Error('Duplicate SEO export argument');
    seen.add(flag);
    if (flag === '--confirm-read') options.confirmRead = true;
    else if (flag === '--dry-run') options.dryRun = true;
    else if (flag === '--help') options.help = true;
    else if (values.has(flag)) {
      const value = argv[++index];
      if (!value || value.startsWith('--')) throw new Error('SEO export argument requires a value');
      options[values.get(flag)] = value;
    } else throw new Error('Unknown SEO export argument');
  }
  if (options.target && !['local', 'staging'].includes(options.target)) throw new Error('SEO exports allow only explicitly authorized local or staging targets');
  if (options.confirmRead && (options.dryRun || !options.target || !options.output)) throw new Error('Reading requires --target local|staging --confirm-read --output local-data/file.json without --dry-run');
  if (options.contentOutput && !options.output) throw new Error('Content output requires a catalog output');
  return options;
}

function inside(parent, candidate) {
  const relative = path.relative(parent, candidate);
  return relative !== '' && !relative.startsWith('..') && !path.isAbsolute(relative);
}

export function resolveSeoExportOutput(output, projectRoot = SEO_PROJECT_ROOT) {
  if (typeof output !== 'string' || !output || path.extname(output).toLowerCase() !== '.json') throw new Error('SEO export output must be a JSON file in local-data');
  const localData = path.resolve(projectRoot, 'local-data');
  const destination = path.resolve(projectRoot, output);
  if (!inside(localData, destination)) throw new Error('SEO export output must remain inside local-data');
  return destination;
}

async function assertRealExportPath(destination, projectRoot = SEO_PROJECT_ROOT) {
  const realProject = await realpath(projectRoot);
  const localData = path.resolve(projectRoot, 'local-data');
  let current = destination;
  for (;;) {
    try {
      const resolved = await realpath(current);
      const relative = path.relative(realProject, resolved);
      if (relative !== 'local-data' && !relative.startsWith(`local-data${path.sep}`)) throw new Error('SEO export output resolves outside local-data');
      return;
    } catch (error) {
      if (error.code !== 'ENOENT') throw error;
      if (current === localData) return; // Its parent is the known real project, and creation is explicit after read authorization.
      const parent = path.dirname(current);
      if (parent === current || !inside(projectRoot, parent)) throw new Error('SEO export output has no safe directory');
      current = parent;
    }
  }
}

function plain(value, maximum) {
  return typeof value === 'string' ? [...value.trim()].slice(0, maximum).join('') : '';
}

function dateString(value) {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.valueOf()) ? null : date.toISOString();
}

export function approvedMediaOrigin(baseUrl) {
  if (!baseUrl) return null;
  try {
    const url = new URL(baseUrl);
    return url.protocol === 'https:' && !url.username && !url.password && !url.search && !url.hash ? url.origin : null;
  } catch { return null; }
}

export function exportCategoryDto(category, mediaBaseUrl = '') {
  if (category?.active !== true || !category._id || !SLUG.test(category.slug || '') || !plain(category.name, 160)) return null;
  return { _id: String(category._id), name: plain(category.name, 160), slug: category.slug, parentId: category.parentId ? String(category.parentId) : null, active: true, imageUrl: mediaUrlForKey(category.imageKey, mediaBaseUrl), productCount: 0, updatedAt: dateString(category.updatedAt) };
}

export function exportProductDto(product, categories, mediaBaseUrl = '') {
  if (!product?._id || product.status !== 'ready' || product.published !== true || product.priceApproved !== true || product.inventory?.approved !== true || product.reviewRequired !== false || !Number.isSafeInteger(product.pricePiastres) || product.pricePiastres < 0 || !SLUG.test(product.slug || '') || !plain(product.name, 240)) return null;
  const variants = product.variants || [];
  if (!Array.isArray(variants) || variants.some((variant) => variant.inventory?.approved !== true || variant.pricePiastres != null && (variant.priceApproved !== true || !Number.isSafeInteger(variant.pricePiastres) || variant.pricePiastres < 0))) return null;
  const main = categories.get(String(product.categoryId));
  const child = product.subcategoryId ? categories.get(String(product.subcategoryId)) : null;
  if (!main?.active || main.parentId || product.subcategoryId && (!child?.active || child.parentId !== main._id)) return null;
  const presentation = (category) => category ? { _id: category._id, name: category.name, slug: category.slug } : null;
  return {
    _id: String(product._id), name: plain(product.name, 240), slug: product.slug, description: plain(product.description, 10_000), category: presentation(main), subcategory: presentation(child),
    mainImageUrl: mediaUrlForKey(product.mainImageKey, mediaBaseUrl), pricePiastres: product.pricePiastres, compareAtPiastres: Number.isSafeInteger(product.compareAtPiastres) && product.compareAtPiastres > product.pricePiastres ? product.compareAtPiastres : null,
    priceApproved: true, orderingAvailable: productCanOrder(product), inventoryMode: product.inventory.mode,
    variants: variants.map((variant) => ({ key: plain(variant.key, 120), attributes: (variant.attributes || []).map(({ name, value }) => ({ name: plain(name, 120), value: plain(value, 120) })), pricePiastres: variant.pricePiastres ?? product.pricePiastres, orderingAvailable: productCanOrder({ inventory: variant.inventory }), inventoryMode: variant.inventory.mode })),
    updatedAt: dateString(product.updatedAt), seoEligibility: { status: 'ready', published: true, inventoryApproved: true, reviewRequired: false, categoriesActive: true },
  };
}

export function exportApprovedContent(record) {
  const routes = {};
  const sections = { about: '/about', privacyPolicy: '/privacy-policy', refundPolicy: '/refund-policy', shippingPolicy: '/shipping-policy', termsOfService: '/terms-of-service' };
  for (const [key, pathname] of Object.entries(sections)) {
    const section = record?.[key];
    if (section?.approved !== true || !plain(section.title, 160) || !plain(section.body, 15000)) continue;
    const body = plain(section.body, 15000);
    const blocks = body.split(/\r?\n\s*\r?\n/).map((value) => value.trim()).filter(Boolean);
    const paragraphs = blocks.length <= 100 ? blocks : [body];
    routes[pathname] = { approved: true, title: plain(section.title, 160), description: plain(paragraphs[0], 160), heading: plain(section.title, 160), paragraphs, updatedAt: dateString(section.updatedAt) };
  }
  const contact = record?.contact;
  if (contact?.approved === true) {
    const paragraphs = [plain(contact.body, 3000), ...[['Email', 'email'], ['Phone', 'phone'], ['WhatsApp', 'whatsapp'], ['Instagram', 'instagram'], ['Address', 'address']].filter(([, key]) => plain(contact[key], 1000)).map(([label, key]) => `${label}: ${plain(contact[key], 1000)}`)].filter(Boolean);
    if (paragraphs.length && ['email', 'phone', 'whatsapp', 'instagram'].some((key) => plain(contact[key], 1000))) routes['/contact'] = { approved: true, title: 'Contact', heading: 'Contact', description: plain(paragraphs[0], 160), paragraphs, updatedAt: dateString(contact.updatedAt) };
  }
  return { routes };
}

async function pages(readPage, onBatch, maximumPages = SEO_MAX_PAGES) {
  let after = null;
  for (let page = 1; page <= maximumPages; page += 1) {
    const rows = await readPage({ after, limit: SEO_PAGE_SIZE });
    if (!Array.isArray(rows) || rows.length > SEO_PAGE_SIZE) throw new Error('SEO source exceeded the 20-record page limit');
    if (!rows.length) return;
    await onBatch(rows);
    const next = rows.at(-1)?._id;
    if (!next || String(next) === String(after)) throw new Error('SEO source pagination failed to advance');
    after = next;
    if (rows.length < SEO_PAGE_SIZE) return;
  }
  throw new Error('SEO export exceeded the bounded page limit; no output was written');
}

export async function buildApprovedSeoExport(source, configuration = {}, { maximumPages = SEO_MAX_PAGES, now = new Date(), mediaVerification } = {}) {
  const mediaBaseUrl = approvedMediaOrigin(configuration.CATALOG_MEDIA_BASE_URL) ? configuration.CATALOG_MEDIA_BASE_URL : '';
  const categoryMap = new Map();
  const report = { sourceProducts: 0, sourceCategories: 0, excludedProducts: 0, excludedCategories: 0 };
  const registerCategories = (rows, child = false) => {
    for (const row of rows) {
      report.sourceCategories += 1;
      const dto = exportCategoryDto(row, mediaBaseUrl);
      if (!dto || (child ? !dto.parentId || !categoryMap.has(dto.parentId) || categoryMap.get(dto.parentId).parentId : dto.parentId !== null)) { report.excludedCategories += 1; continue; }
      if (categoryMap.has(dto._id) || [...categoryMap.values()].some((category) => category.slug === dto.slug)) throw new Error('SEO category identifiers or slugs are duplicated');
      categoryMap.set(dto._id, dto);
    }
  };
  await pages(source.readMainCategoryPage, (rows) => registerCategories(rows), maximumPages);
  const mainIds = [...categoryMap.keys()];
  await pages((params) => source.readSubcategoryPage({ ...params, mainIds }), (rows) => registerCategories(rows, true), maximumPages);
  const products = [];
  const slugs = new Set();
  const ids = new Set();
  await pages((params) => source.readProductPage({ ...params, categories: categoryMap }), (rows) => {
    for (const row of rows) {
      report.sourceProducts += 1;
      const dto = exportProductDto(row, categoryMap, mediaBaseUrl);
      if (!dto) { report.excludedProducts += 1; continue; }
      if (ids.has(dto._id) || slugs.has(dto.slug)) throw new Error('SEO product identifiers or slugs are duplicated');
      ids.add(dto._id); slugs.add(dto.slug); products.push(dto);
      categoryMap.get(dto.category._id).productCount += 1;
      if (dto.subcategory) categoryMap.get(dto.subcategory._id).productCount += 1;
    }
  }, maximumPages);
  const mediaOrigins = mediaBaseUrl ? [approvedMediaOrigin(mediaBaseUrl)] : [];
  const verified = verifiedMediaEntries(mediaVerification, mediaOrigins, now);
  const objects = [...new Set(products.map((item) => item.mainImageUrl))].map((url) => verified.get(url)).filter(Boolean);
  const catalog = { version: 1, source: 'approved-public-catalog', generatedAt: dateString(now), checkoutEnabled: configuration.CHECKOUT_ENABLED === 'true' && configuration.COMMERCE_LAUNCH_AUTHORIZED === 'true', mediaOrigins, mediaVerification: { version: 1, source: MEDIA_VERIFICATION_SOURCE, objects }, products, categories: [...categoryMap.values()] };
  const content = source.readSiteContent ? exportApprovedContent(await source.readSiteContent()) : { routes: {} };
  return { catalog, content, report: { ...report, exportedProducts: products.length, exportedCategories: categoryMap.size, verifiedProductImages: products.filter((item) => verified.get(item.mainImageUrl)).length, unverifiedProductImages: products.filter((item) => !verified.get(item.mainImageUrl)).length, approvedContentPages: Object.keys(content.routes).length } };
}

export async function openReadOnlySeoSource(uri, settings) {
  // No dotenv import, global application connection, model initialization or index creation.
  const { default: mongoose } = await import('mongoose');
  const connection = mongoose.createConnection(uri, { dbName: settings.dbName, autoCreate: false, autoIndex: false, serverSelectionTimeoutMS: 10000, connectTimeoutMS: 10000, socketTimeoutMS: 10000, maxPoolSize: 2 });
  const validate = () => assertConnectedDatabase(connection, { target: settings.target, nodeEnv: settings.nodeEnv });
  try { await connection.asPromise(); validate(); } catch (error) { await connection.close(); throw error; }
  const categoryIds = new Map();
  const page = async (collection, filter, projection, { after, limit }) => {
    validate();
    const cursor = connection.db.collection(collection).find(after ? { $and: [filter, { _id: { $gt: after } }] } : filter, { projection, maxTimeMS: 3000 }).sort({ _id: 1 }).limit(Math.min(limit, SEO_PAGE_SIZE));
    const result = await cursor.toArray();
    if (collection === 'categories') result.forEach((record) => categoryIds.set(String(record._id), record._id));
    return result;
  };
  return {
    readMainCategoryPage: (params) => page('categories', { active: true, parentId: null }, CATEGORY_FIELDS, params),
    readSubcategoryPage: (params) => page('categories', { active: true, parentId: { $in: params.mainIds.map((id) => categoryIds.get(id)).filter(Boolean) } }, CATEGORY_FIELDS, params),
    readProductPage: (params) => {
      const mainIds = [...params.categories.values()].filter((category) => !category.parentId).map((category) => categoryIds.get(category._id)).filter(Boolean);
      const childIds = [...params.categories.values()].filter((category) => category.parentId).map((category) => categoryIds.get(category._id)).filter(Boolean);
      return page('products', { $and: [publicProductFilter(), { categoryId: { $in: mainIds } }, { $or: [{ subcategoryId: null }, { subcategoryId: { $in: childIds } }] }] }, PRODUCT_FIELDS, params);
    },
    readSiteContent: async () => { validate(); return connection.db.collection('sitecontents').findOne({ key: 'website-v1' }, { projection: CONTENT_FIELDS, maxTimeMS: 3000 }); },
    close: () => connection.close(),
  };
}

async function writeExportFile(destination, value) {
  await assertRealExportPath(destination);
  await mkdir(path.dirname(destination), { recursive: true });
  await assertRealExportPath(destination);
  const temporary = path.join(path.dirname(destination), `.seo-export-${randomUUID()}.tmp`);
  try {
    await writeFile(temporary, `${JSON.stringify(value, null, 2)}\n`, { encoding: 'utf8', flag: 'wx' });
    await assertRealExportPath(destination);
    await rename(temporary, destination);
  } finally { await unlink(temporary).catch((error) => { if (error.code !== 'ENOENT') throw error; }); }
}

export async function runSeoCatalogExport(argv, { environment = process.env, log = console.log, openSource = openReadOnlySeoSource, writeOutput = writeExportFile } = {}) {
  const options = parseSeoExportArguments(argv);
  if (options.help) { log('Offline default: npm run seo:export. Authorized read only: --target local|staging --confirm-read --output local-data/approved-seo-export.json [--content-output local-data/approved-site-content.json]. Uses explicit terminal MONGODB_URI; never loads .env, writes a database or creates indexes.'); return null; }
  const output = options.output ? resolveSeoExportOutput(options.output) : null;
  const contentOutput = options.contentOutput ? resolveSeoExportOutput(options.contentOutput) : null;
  if (output && contentOutput === output) throw new Error('Catalog and content outputs must be different files');
  if (!options.confirmRead) {
    const report = { mode: 'dry-run', databaseConnected: false, databaseWrites: false, filesWritten: false, target: options.target, pageSize: SEO_PAGE_SIZE, maximumPages: SEO_MAX_PAGES, dotenvLoaded: false };
    log(JSON.stringify(report)); return report;
  }
  if (environment.NODE_ENV === 'production') throw new Error('Production SEO database access is disabled');
  const settings = validateDatabaseUri(environment.MONGODB_URI, { target: options.target, nodeEnv: environment.NODE_ENV || 'development' });
  await assertRealExportPath(output);
  if (contentOutput) await assertRealExportPath(contentOutput);
  const source = await openSource(environment.MONGODB_URI, { ...settings, nodeEnv: environment.NODE_ENV || 'development' });
  try {
    let mediaVerification;
    if (options.mediaVerification) {
      // Explicit ignored local artifact only; never read .env or contact media storage.
      const destination = resolveSeoExportOutput(options.mediaVerification);
      await assertRealExportPath(destination);
      const { readFile, stat } = await import('node:fs/promises');
      if (!(await stat(destination)).isFile() || (await stat(destination)).size > 10 * 1024 * 1024) throw new Error('Media verification artifact exceeds the allowed size');
      mediaVerification = JSON.parse(await readFile(destination, 'utf8'));
    }
    const result = await buildApprovedSeoExport(source, environment, { mediaVerification });
    await writeOutput(output, result.catalog);
    if (contentOutput) await writeOutput(contentOutput, result.content);
    const report = { mode: 'authorized-read-only-export', target: settings.target, dbName: settings.dbName, databaseWrites: false, indexesCreated: false, dotenvLoaded: false, pageSize: SEO_PAGE_SIZE, ...result.report, output: path.relative(SEO_PROJECT_ROOT, output).split(path.sep).join('/'), contentOutput: contentOutput ? path.relative(SEO_PROJECT_ROOT, contentOutput).split(path.sep).join('/') : null };
    log(JSON.stringify(report)); return report;
  } finally { await source.close(); }
}

if (process.argv[1] && pathToFileURL(process.argv[1]).href === import.meta.url) {
  runSeoCatalogExport(process.argv.slice(2)).catch((error) => {
    // Arbitrary driver, URI and file content errors are never printed.
    process.stderr.write(`${JSON.stringify({ ok: false, error: databaseDiagnostic(error), message: 'SEO export failed; check explicit local/staging target, authorized read flags and local-data output paths.' })}\n`);
    process.exitCode = 1;
  });
}
