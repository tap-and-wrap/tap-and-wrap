import { test, expect } from '@playwright/test';
import {
  createProductDraft,
  createProductPayload,
  integerInput,
  parsePriceInput,
  priceInput,
} from '../src/admin/catalog-form.js';
import { applyCatalogFilters, egpToPiastres, piastresToInput, readCatalogParams } from '../src/utils/catalog.js';

function draftFixture(overrides = {}) {
  return {
    ...createProductDraft({
      name: 'Isolated helper fixture',
      slug: 'isolated-helper-fixture',
      categoryId: '000000000000000000000001',
      pricePiastres: 1234,
      compareAtPiastres: 1500,
      priceApproved: true,
      galleryKeys: ['Tests/main.webp', 'Tests/secondary.webp'],
      inventory: { mode: 'tracked', quantity: 10, approved: true, available: true },
    }),
    ...overrides,
  };
}

test('merchant EGP inputs convert precisely to integer piastres', () => {
  expect(parsePriceInput('12.34')).toBe(1234);
  expect(parsePriceInput('12.3')).toBe(1230);
  expect(parsePriceInput('0.01')).toBe(1);
  expect(parsePriceInput('0')).toBe(0);
  expect(parsePriceInput(' 12.34 ')).toBe(1234);
  expect(parsePriceInput('90071992547409.91')).toBe(Number.MAX_SAFE_INTEGER);
});

test('blank merchant prices stay unset', () => {
  expect(parsePriceInput('')).toBeNull();
  expect(parsePriceInput('   ')).toBeNull();
});

test('accepted monetary values round-trip at the safe integer boundary', () => {
  expect(priceInput(Number.MAX_SAFE_INTEGER)).toBe('90071992547409.91');
  expect(parsePriceInput(priceInput(Number.MAX_SAFE_INTEGER))).toBe(Number.MAX_SAFE_INTEGER);
  expect(priceInput(1)).toBe('0.01');
  expect(priceInput(0)).toBe('0.00');
});

test('invalid merchant prices cannot become approved integer amounts', () => {
  for (const value of ['-1', '1e2', '1.234', '.5', '1.', '1,000', 'NaN', 'Infinity', '90071992547409.92']) {
    expect(() => parsePriceInput(value), value).toThrow();
  }
});

test('inventory and selection order inputs require non-negative whole numbers', () => {
  expect(integerInput('10', 'Quantity')).toBe(10);
  expect(integerInput('0', 'Order')).toBe(0);
  for (const value of ['-1', '1.5', '1e2', '', '9007199254740992']) {
    expect(() => integerInput(value, 'Quantity'), value).toThrow();
  }
});

test('a new draft keeps default stock provisional at ten', () => {
  const draft = createProductDraft();
  expect(draft.status).toBe('draft');
  expect(draft.price).toBe('');
  expect(draft.priceApproved).toBe(false);
  expect(draft.inventory).toEqual({ mode: 'tracked', quantity: '10', approved: false, available: true });
});

test('Made by Request saves without a stock quantity', () => {
  const payload = createProductPayload(draftFixture({ inventory: { mode: 'made_to_order', quantity: '999', approved: true, available: true } }));
  expect(payload.inventory).toEqual({ mode: 'made_to_order', quantity: null, approved: true, available: true });
});

test('gallery ordering determines the selected primary photo', () => {
  const payload = createProductPayload(draftFixture({ galleryKeys: ['Tests/secondary.webp', 'Tests/main.webp'] }));
  expect(payload.mainImageKey).toBe('Tests/secondary.webp');
  expect(payload.galleryKeys).toEqual(['Tests/secondary.webp', 'Tests/main.webp']);
  const empty = createProductPayload(draftFixture({ galleryKeys: [] }));
  expect(empty.mainImageKey).toBeNull();
});

test('saving omits configuration, source and classification fields', () => {
  const payload = createProductPayload(draftFixture({
    personalization: { fields: [{ key: 'name', required: true }] },
    customization: { enabled: true, templateId: 'existing-template' },
    catalogSource: { originalProductId: 'SOURCE-TEST' },
    importSource: { rowNumber: 1 },
    externalCatalogId: 'SOURCE-TEST',
    catalogRole: 'Customizable Product',
    reviewReasons: ['Original source grouping'],
    merchantReviewNotes: 'Existing merchant configuration',
  }));
  for (const key of ['personalization', 'customization', 'catalogSource', 'importSource', 'externalCatalogId', 'catalogRole', 'reviewReasons', 'merchantReviewNotes']) {
    expect(payload, key).not.toHaveProperty(key);
  }
});

test('configured variants and explicit approvals are preserved', () => {
  const product = {
    name: 'Isolated variant fixture', slug: 'isolated-variant-fixture', categoryId: '000000000000000000000001',
    pricePiastres: 1000, priceApproved: true,
    inventory: { mode: 'tracked', quantity: 10, approved: true, available: true },
    variants: [{ key: 'blue-small', sku: 'TEST-BLUE-SMALL', attributes: [{ name: 'Color', value: 'Blue' }, { name: 'Size', value: 'Small' }], pricePiastres: 1234, priceApproved: true, inventory: { mode: 'made_to_order', quantity: null, approved: true, available: false } }],
  };
  const payload = createProductPayload(createProductDraft(product));
  expect(payload.priceApproved).toBe(true);
  expect(payload.inventory.approved).toBe(true);
  expect(payload.variants).toEqual(product.variants);
});

test('duplicate gallery references are rejected before saving', () => {
  expect(() => createProductPayload(draftFixture({ galleryKeys: ['Tests/main.webp', 'Tests/main.webp'] }))).toThrow('unique');
});

test('empty approvals and compare-at prices below the price are rejected', () => {
  expect(() => createProductPayload(draftFixture({ price: '', priceApproved: true }))).toThrow('before approving');
  expect(() => createProductPayload(draftFixture({ price: '12.34', compareAt: '12.33' }))).toThrow('at least');
});

test('storefront EGP filters use integer piastre strings without accepting invalid amounts', () => {
  expect(egpToPiastres('12.34')).toBe('1234');
  expect(egpToPiastres('12.3')).toBe('1230');
  expect(egpToPiastres('0.01')).toBe('1');
  expect(egpToPiastres('90071992547409.91')).toBe(String(Number.MAX_SAFE_INTEGER));
  expect(egpToPiastres('')).toBe('');
  for (const value of ['-1', '1e2', '1.234', '.5', 'NaN', 'Infinity', '90071992547409.92']) {
    expect(egpToPiastres(value), value).toBeNull();
  }
});

test('storefront price input formatting preserves exact piastres and trims only decimal zeroes', () => {
  expect(piastresToInput(String(Number.MAX_SAFE_INTEGER))).toBe('90071992547409.91');
  expect(egpToPiastres(piastresToInput(String(Number.MAX_SAFE_INTEGER)))).toBe(String(Number.MAX_SAFE_INTEGER));
  expect(piastresToInput('1230')).toBe('12.3');
  expect(piastresToInput('1200')).toBe('12');
  expect(piastresToInput('1')).toBe('0.01');
  expect(piastresToInput('0')).toBe('0');
  expect(piastresToInput('')).toBe('');
  expect(piastresToInput('-1')).toBe('');
  expect(piastresToInput('1.5')).toBe('');
});

test('catalog URL pagination fixes the limit at twenty and accepts only pages one through two hundred', () => {
  expect(readCatalogParams(new URLSearchParams('page=200&limit=1000'))).toMatchObject({ page: 200, limit: 20 });
  expect(readCatalogParams(new URLSearchParams('page=2&limit=1'))).toMatchObject({ page: 2, limit: 20 });
  for (const page of ['201', '0', '-1', '1.5', 'NaN', '']) {
    expect(readCatalogParams(new URLSearchParams({ page })).page, page).toBe(1);
  }
});

test('catalog URL filters normalize search and reject invalid price and availability values', () => {
  expect(readCatalogParams(new URLSearchParams({ q: '  Test fixture  ', category: 'test-main', subcategory: 'test-sub', availability: 'sold_out', minPrice: '1234', maxPrice: '5678' }))).toMatchObject({ q: 'Test fixture', category: 'test-main', subcategory: 'test-sub', availability: 'sold_out', minPrice: '1234', maxPrice: '5678' });
  expect(readCatalogParams(new URLSearchParams({ minPrice: '-1', maxPrice: '1.5', availability: 'unapproved' }))).toMatchObject({ minPrice: '', maxPrice: '', availability: '' });
  expect(readCatalogParams(new URLSearchParams({ q: 'x'.repeat(150) })).q).toHaveLength(100);
});

test('all seven catalog sorts are preserved and invalid sorts return Featured', () => {
  for (const sort of ['featured', 'best_sellers', 'newest', 'price_asc', 'price_desc', 'name_asc', 'name_desc']) {
    expect(readCatalogParams(new URLSearchParams({ sort })).sort, sort).toBe(sort);
  }
  expect(readCatalogParams(new URLSearchParams('sort=unverified-ranking')).sort).toBe('featured');
});

test('applying catalog filters resets the page while preserving search and sorting', () => {
  const original = new URLSearchParams('q=Test+fixture&sort=price_asc&page=5&category=old&subcategory=old-sub&other=keep');
  const updated = applyCatalogFilters(original, { category: 'new-main', subcategory: 'new-sub', availability: 'available', minPrice: '100', maxPrice: '500' });
  expect(Object.fromEntries(updated)).toEqual({ q: 'Test fixture', sort: 'price_asc', category: 'new-main', subcategory: 'new-sub', availability: 'available', minPrice: '100', maxPrice: '500', other: 'keep' });
  expect(updated.has('page')).toBe(false);
  expect(original.get('page')).toBe('5');
  expect(original.get('category')).toBe('old');
});

test('clearing filter values removes filters and pagination without losing search or sort', () => {
  const updated = applyCatalogFilters(new URLSearchParams('q=Test&sort=name_desc&page=3&category=test-main&subcategory=test-sub&availability=available&minPrice=100&maxPrice=500'), { category: '', subcategory: '', availability: '', minPrice: '', maxPrice: '' });
  expect(Object.fromEntries(updated)).toEqual({ q: 'Test', sort: 'name_desc' });
});
