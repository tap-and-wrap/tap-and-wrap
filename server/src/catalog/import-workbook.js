import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import readExcelFile from 'read-excel-file/node';
import { isSafeImageReference } from './fields.js';

export const MASTER_SHEET = 'Website Product Master';
export const IMAGE_SHEET = 'Image Index';
export const CATEGORY_SHEET = 'Category Summary';
export const IMAGE_HEADERS = ['Image 1 (Main)', ...Array.from({ length: 22 }, (_, index) => `Image ${index + 2}`)];
export const MASTER_HEADERS = [
  'Product ID', 'Product Name', 'Main Category', 'Subcategory', 'Description', 'Catalog Role',
  'Confidence', 'SKU', 'Price EGP', 'Compare-at Price EGP', 'Stock Status', 'Quantity',
  'Variant / Customization Details', 'Merchant Notes', 'Publish Status', 'Image Count', ...IMAGE_HEADERS,
];
export const INDEX_HEADERS = ['Product ID', 'Product Name', 'Image Number', 'Image Role', 'Clean Relative Path'];
export const CATEGORY_HEADERS = ['Main Category', 'Subcategory', 'Products'];
export const PRODUCT_ROLES = ['Product', 'Customizable Product', 'Variant Product'];
export const COMPONENT_ROLES = ['Customization Option', 'Gift Packaging'];

const hash = (value) => createHash('sha256').update(value).digest('hex');
const blank = (value) => value === null || value === undefined || String(value).trim() === '';
const cellText = (value) => blank(value) ? '' : String(value);
const displayText = (value) => cellText(value).trim();
const normalizedName = (value) => value.normalize('NFKC').trim().toLowerCase();
export const slugify = (value) => value.normalize('NFKD').replace(/[\u0300-\u036f]/g, '').toLowerCase()
  .replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'catalog';

export async function workbookSha256(filePath) {
  return hash(await readFile(filePath));
}

export async function readCatalogWorkbook(filePath) {
  const sheets = await readExcelFile(filePath, { trim: false });
  return sheets.map(({ sheet, data }) => ({ name: sheet, rows: data }));
}

function sheetRows(sheets, name, headers, report) {
  const sheet = sheets.find((item) => item.name === name);
  if (!sheet || !Array.isArray(sheet.rows) || sheet.rows.length === 0) {
    report.fatalErrors.push(`Missing or empty worksheet: ${name}`);
    return [];
  }
  const actual = sheet.rows[0].map(cellText);
  const missing = headers.filter((header) => !actual.includes(header));
  const unknown = actual.filter((header) => !headers.includes(header));
  const duplicate = actual.filter((header, index) => actual.indexOf(header) !== index);
  if (missing.length || unknown.length || duplicate.length || actual.length !== headers.length) {
    report.fatalErrors.push(`${name}: header mismatch. Missing: ${missing.join(', ') || 'none'}; unexpected: ${unknown.join(', ') || 'none'}; duplicates: ${duplicate.join(', ') || 'none'}`);
    return [];
  }
  report.headers[name] = actual;
  return sheet.rows.slice(1).map((row, index) => ({
    rowNumber: index + 2,
    cells: Object.fromEntries(actual.map((header, column) => [header, row[column] ?? null])),
  })).filter(({ cells }) => Object.values(cells).some((value) => !blank(value)));
}

export function validateImageReference(value) {
  if (typeof value !== 'string' || value !== value.trim()) return 'Image reference must be an unpadded string';
  return isSafeImageReference(value) ? null : 'Image reference must be a safe relative WebP, PNG or JPEG path of at most 500 characters';
}

function numericCell(value, label, issues, { integer = false, optional = true } = {}) {
  if (blank(value)) {
    if (!optional) issues.push(`${label} is required`);
    return null;
  }
  if ((typeof value !== 'number' && typeof value !== 'string') || !/^(?:\d+)(?:\.\d+)?$/.test(String(value).trim())) {
    issues.push(`${label} must be a nonnegative ${integer ? 'integer' : 'number'}`);
    return null;
  }
  const number = Number(value);
  if (!Number.isFinite(number) || number < 0 || (integer && !Number.isSafeInteger(number))) {
    issues.push(`${label} must be a safe nonnegative ${integer ? 'integer' : 'number'}`);
    return null;
  }
  return number;
}

function priceCell(value, label, issues) {
  const egp = numericCell(value, label, issues);
  if (egp === null) return null;
  const piastres = Math.round(egp * 100);
  if (!Number.isSafeInteger(piastres) || Math.abs(egp * 100 - piastres) > 0.000001) {
    issues.push(`${label} must contain at most two decimal places and fit in integer piastres`);
    return null;
  }
  return piastres;
}

function sourceCategoryKey(mainCategory, subcategory = '') {
  return JSON.stringify([normalizedName(mainCategory), normalizedName(subcategory)]);
}

function makeCategory(mainCategory, subcategory, order) {
  const key = sourceCategoryKey(mainCategory, subcategory);
  const name = subcategory || mainCategory;
  return {
    key,
    parentKey: subcategory ? sourceCategoryKey(mainCategory) : null,
    sourceMainCategory: mainCategory,
    name,
    nameNormalized: normalizedName(name),
    slug: `${slugify(subcategory ? `${mainCategory}-${subcategory}` : mainCategory).slice(0, 130)}-${hash(key).slice(0, 8)}`,
    active: true,
    featured: false,
    order,
    imageKey: null,
  };
}

/** Build a validated import plan without contacting any database. */
export function buildCatalogPlan(sheets, { workbookHash = '' } = {}) {
  const report = {
    mode: 'dry-run', workbookSha256: workbookHash,
    headers: {}, fatalErrors: [], invalidRows: [], reviewRows: [], warnings: [], roleCounts: {},
    counts: { catalogEntries: 0, products: 0, components: 0, mainCategories: 0, subcategories: 0,
      categories: 0, imageReferences: 0, indexedImageReferences: 0, invalidRows: 0, reviewRows: 0 },
    primaryImagesNotEnding01: [],
    safeguards: ['No database connection in dry-run', 'No image uploads or local image changes',
      'All imported prices and inventory are provisional', 'All imported entries stay draft or hold',
      'Existing catalog records are preserved on reimport'],
  };
  const rows = sheetRows(sheets, MASTER_SHEET, MASTER_HEADERS, report);
  const indexRows = sheetRows(sheets, IMAGE_SHEET, INDEX_HEADERS, report);
  const categoryRows = sheetRows(sheets, CATEGORY_SHEET, CATEGORY_HEADERS, report);
  if (report.fatalErrors.length) return { report, categories: [], products: [], components: [] };

  report.counts.catalogEntries = rows.length;
  const idCounts = new Map();
  for (const { cells } of rows) {
    const id = cellText(cells['Product ID']);
    idCounts.set(id, (idCounts.get(id) || 0) + 1);
  }
  const indexById = new Map();
  for (const { cells, rowNumber } of indexRows) {
    const issues = [];
    const id = cellText(cells['Product ID']);
    const number = numericCell(cells['Image Number'], 'Image Number', issues, { integer: true, optional: false });
    const path = cellText(cells['Clean Relative Path']);
    const pathIssue = validateImageReference(path);
    if (pathIssue) issues.push(pathIssue);
    if (!idCounts.has(id)) issues.push('Image Index references an unknown Product ID');
    if (!number || number > 23) issues.push('Image Number must be from 1 to 23');
    const expectedRole = number === 1 ? 'Main image' : 'Secondary image';
    if (displayText(cells['Image Role']) !== expectedRole) issues.push(`Image Role must be ${expectedRole} for image number ${number}`);
    report.counts.indexedImageReferences += 1;
    const indexed = indexById.get(id) || [];
    indexed.push({ number, path, role: displayText(cells['Image Role']), name: cellText(cells['Product Name']), rowNumber, issues });
    indexById.set(id, indexed);
    if (issues.length) report.invalidRows.push({ sheet: IMAGE_SHEET, rowNumber, productId: id, issues });
  }

  const categoryMap = new Map();
  const summaryKeys = new Map();
  let mainOrder = 0;
  const childOrders = new Map();
  for (const { cells, rowNumber } of categoryRows) {
    const issues = [];
    const main = displayText(cells['Main Category']);
    const sub = displayText(cells.Subcategory);
    if (!main || !sub) issues.push('Category Summary requires Main Category and Subcategory');
    if (main.length > 160 || sub.length > 160) issues.push('Category names must contain at most 160 characters');
    const count = numericCell(cells.Products, 'Products', issues, { integer: true, optional: false });
    const key = sourceCategoryKey(main, sub);
    if (summaryKeys.has(key)) issues.push('Duplicate Category Summary grouping');
    summaryKeys.set(key, { count, rowNumber, main, sub });
    if (issues.length) {
      report.invalidRows.push({ sheet: CATEGORY_SHEET, rowNumber, issues });
      continue;
    }
    const mainKey = sourceCategoryKey(main);
    if (!categoryMap.has(mainKey)) categoryMap.set(mainKey, makeCategory(main, '', mainOrder++));
    const order = childOrders.get(mainKey) || 0;
    categoryMap.set(key, makeCategory(main, sub, order));
    childOrders.set(mainKey, order + 1);
  }

  const products = [];
  const components = [];
  const actualCategoryCounts = new Map();
  for (const { cells, rowNumber } of rows) {
    const issues = [];
    const reviewReasons = [];
    const id = cellText(cells['Product ID']);
    const name = cellText(cells['Product Name']);
    const main = displayText(cells['Main Category']);
    const sub = displayText(cells.Subcategory);
    const role = displayText(cells['Catalog Role']);
    const confidence = displayText(cells.Confidence);
    report.roleCounts[role || '(blank)'] = (report.roleCounts[role || '(blank)'] || 0) + 1;
    if (!/^[a-z0-9][a-z0-9_-]{0,99}$/i.test(id)) issues.push('Product ID must be an unpadded stable catalog identifier of at most 100 letters, digits, underscores or hyphens');
    if (idCounts.get(id) > 1) issues.push('Duplicate Product ID in master');
    if (!name.trim()) issues.push('Product Name is required');
    if (name.length > 240) issues.push('Product Name must contain at most 240 characters');
    if (cellText(cells.Description).length > 10000) issues.push('Description must contain at most 10000 characters');
    if (cellText(cells.SKU).length > 100) issues.push('SKU must contain at most 100 characters');
    if (!main || !sub) issues.push('Main Category and Subcategory are required');
    if (main.length > 160 || sub.length > 160) issues.push('Category names must contain at most 160 characters');
    if (![...PRODUCT_ROLES, ...COMPONENT_ROLES].includes(role)) {
      issues.push(`Unrecognized Catalog Role: ${role || '(blank)'}`);
      reviewReasons.push('Unrecognized catalog role requires classification');
    }
    if (!['High', 'Medium'].includes(confidence)) issues.push(`Unrecognized Confidence: ${confidence || '(blank)'}`);
    if (confidence === 'Medium') reviewReasons.push('Medium catalog confidence');
    const merchantNotes = cellText(cells['Merchant Notes']);
    const variantNotes = cellText(cells['Variant / Customization Details']);
    if (merchantNotes.length > 10000 || variantNotes.length > 10000) issues.push('Merchant and variant/customization notes must each contain at most 10000 characters');
    if (merchantNotes.trim()) reviewReasons.push('Merchant notes require review');
    if (variantNotes.trim()) reviewReasons.push('Variant or customization grouping requires review');
    if (role === 'Customizable Product') reviewReasons.push('Customization configuration requires merchant approval');
    if (role === 'Variant Product') reviewReasons.push('Variant product grouping requires merchant approval');
    if (role === 'Gift Packaging') reviewReasons.push('Gift packaging is held as a component pending merchant classification');

    const categoryKey = sourceCategoryKey(main, sub);
    actualCategoryCounts.set(categoryKey, (actualCategoryCounts.get(categoryKey) || 0) + 1);
    if (!summaryKeys.has(categoryKey)) issues.push('Product category grouping is missing from Category Summary');
    const mainKey = sourceCategoryKey(main);
    const gallery = [];
    let gap = false;
    for (const header of IMAGE_HEADERS) {
      const image = cellText(cells[header]);
      if (!image) { gap = true; continue; }
      if (gap) issues.push(`${header} appears after an empty image column`);
      const imageIssue = validateImageReference(image);
      if (imageIssue) issues.push(`${header}: ${imageIssue}`);
      gallery.push(image);
    }
    report.counts.imageReferences += gallery.length;
    if (blank(cells['Image 1 (Main)'])) issues.push('Image 1 (Main) is required');
    if (new Set(gallery).size !== gallery.length) issues.push('Duplicate image references within product');
    const imageCount = numericCell(cells['Image Count'], 'Image Count', issues, { integer: true, optional: false });
    if (imageCount !== gallery.length) issues.push(`Image Count ${imageCount} does not match ${gallery.length} populated image columns`);
    const indexed = [...(indexById.get(id) || [])].sort((left, right) => left.number - right.number);
    // The index audits references; the master defines the selected main photo.
    // Index sequence and filename suffixes must never replace Image 1 (Main).
    if (indexed.length !== gallery.length || indexed.some((entry, index) => entry.number !== index + 1)
      || new Set(indexed.map(({ path }) => path)).size !== gallery.length
      || indexed.some(({ path }) => !gallery.includes(path))) {
      issues.push('Image Index does not match master image references');
    }
    if (indexed.some((entry) => entry.issues.length || entry.name !== name)) issues.push('Image Index has invalid metadata or mismatched product name');
    if (indexed[0] && indexed[0].path !== gallery[0]) issues.push('Image Index main image differs from Image 1 (Main)');
    if (gallery[0] && !/-01\.[a-z0-9]+$/i.test(gallery[0])) report.primaryImagesNotEnding01.push({ productId: id, mainImageKey: gallery[0] });

    const pricePiastres = priceCell(cells['Price EGP'], 'Price EGP', issues);
    const compareAtPiastres = priceCell(cells['Compare-at Price EGP'], 'Compare-at Price EGP', issues);
    if (compareAtPiastres !== null && (pricePiastres === null || compareAtPiastres < pricePiastres)) issues.push('Compare-at price requires a product price no greater than the compare-at price');
    const sourceQuantity = numericCell(cells.Quantity, 'Quantity', issues, { integer: true });
    const stockStatus = displayText(cells['Stock Status']);
    const inventoryModes = { '': 'tracked', 'In Stock': 'tracked', 'Out of Stock': 'tracked', 'Made by Request': 'made_to_order' };
    if (!(stockStatus in inventoryModes)) issues.push(`Unrecognized Stock Status: ${stockStatus}`);
    const publishStatus = displayText(cells['Publish Status']);
    if (publishStatus && !['Draft', 'Ready', 'Hold'].includes(publishStatus)) issues.push(`Unrecognized Publish Status: ${publishStatus}`);
    const status = publishStatus === 'Hold' || reviewReasons.length ? 'hold' : 'draft';
    const fingerprint = hash(JSON.stringify(MASTER_HEADERS.map((header) => cells[header])));
    const record = {
      externalCatalogId: id, name, slug: `${slugify(name).slice(0, 100)}-${slugify(id)}`,
      description: cellText(cells.Description), mainCategoryKey: mainKey, subcategoryKey: categoryKey,
      mainImageKey: gallery[0] || '', galleryKeys: gallery, catalogRole: role, catalogConfidence: confidence,
      merchantReviewNotes: merchantNotes, variantSourceNotes: variantNotes,
      reviewRequired: reviewReasons.length > 0, reviewReasons,
      sku: cellText(cells.SKU) || undefined, pricePiastres, compareAtPiastres, priceApproved: false,
      inventory: { mode: inventoryModes[stockStatus] || 'tracked', quantity: inventoryModes[stockStatus] === 'made_to_order' ? null : 10,
        approved: false, available: stockStatus !== 'Out of Stock' },
      status, published: false,
      catalogSource: { mainCategory: main, subcategory: sub, stockStatus: cellText(cells['Stock Status']),
        quantity: sourceQuantity, priceEGP: blank(cells['Price EGP']) ? null : cells['Price EGP'],
        compareAtPriceEGP: blank(cells['Compare-at Price EGP']) ? null : cells['Compare-at Price EGP'], publishStatus: cellText(cells['Publish Status']) },
      importSource: { fingerprint, workbookSha256: workbookHash, rowNumber },
    };
    if (reviewReasons.length) report.reviewRows.push({ rowNumber, productId: id, role, confidence, reasons: reviewReasons, merchantNotes, variantNotes });
    if (issues.length) {
      report.invalidRows.push({ sheet: MASTER_SHEET, rowNumber, productId: id, issues });
      continue;
    }
    if (COMPONENT_ROLES.includes(role)) {
      const { published, ...component } = record;
      components.push(component);
    }
    else products.push({ ...record, variants: [], personalization: { fields: [] },
      customization: { enabled: false, templateId: null, serviceKind: null, serviceEntryEligible: false } });
  }

  for (const [key, summary] of summaryKeys) {
    const actual = actualCategoryCounts.get(key) || 0;
    if (summary.count !== actual) report.invalidRows.push({ sheet: CATEGORY_SHEET, rowNumber: summary.rowNumber,
      issues: [`Products count ${summary.count} does not match ${actual} master entries for ${summary.main} / ${summary.sub}`] });
  }
  const categories = [...categoryMap.values()];
  Object.assign(report.counts, {
    products: products.length, components: components.length, categories: categories.length,
    mainCategories: categories.filter(({ parentKey }) => parentKey === null).length,
    subcategories: categories.filter(({ parentKey }) => parentKey !== null).length,
    invalidRows: report.invalidRows.length, reviewRows: report.reviewRows.length,
  });
  return { report, categories, products, components };
}
