import { chooseImageFiles } from './media-helpers.js';
import { test, expect } from '@playwright/test';
import { mockCatalog, adminProduct, category } from './catalog-fixtures.js';
import { mockCommerce } from './commerce-fixtures.js';

const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAIAAACQd1PeAAAACXBIWXMAAAPoAAAD6AG1e1JrAAAADElEQVQImWO4NbsXAARVAgOYIL6CAAAAAElFTkSuQmCC', 'base64');
const file = name => ({ name, mimeType: 'image/png', buffer: png });
const cors = { 'Access-Control-Allow-Origin': 'http://127.0.0.1:5191', 'Access-Control-Allow-Credentials': 'true', 'Access-Control-Allow-Headers': 'content-type,x-csrf-token', 'Access-Control-Allow-Methods': 'GET,POST,PATCH,OPTIONS' };
async function mediaFixture(page, { duplicate = false } = {}) {
  let fail = false, count = 0;
  await page.route('**/api/v1/admin/media**', async route => {
    if (route.request().method() === 'OPTIONS') return route.fulfill({ status: 204, headers: cors });
    if (route.request().url().endsWith('/config')) return route.fulfill({ headers: cors, json: { ok: true, data: { baseUrl: 'https://fixture.invalid/', maxBytes: 10485760 } } });
    count++;
    if (fail) return route.fulfill({ status: 503, headers: cors, json: { ok: false, error: { message: 'Image storage unavailable. Retry upload.' } } });
    return route.fulfill({ status: 201, headers: cors, json: { ok: true, data: { image: { key: `catalog-media/v1/${String(duplicate ? 1 : count).padStart(64, '0')}.png`, url: 'https://fixture.invalid/upload.png', width: 1, height: 1 } } } });
  });
  return { fail: value => { fail = value; } };
}
test('product multiple uploads, primary replacement and gallery order preserve imports and revision on mobile', async ({ page }) => {
  const fixture = await mockCatalog(page, { role: 'admin' }); await mediaFixture(page);
  const errors = []; page.on('pageerror', error => errors.push(error.message));
  await page.goto(`/admin/products/${adminProduct._id}/edit`);
  const gallery = page.getByRole('region', { name: 'Product images', exact: true });
  await chooseImageFiles(page, gallery, 'Add images', [file('one.png'), file('two.png')]);
  await expect(page.getByRole('button', { name: 'Save changes', exact: true })).toBeDisabled();
  await expect(gallery.getByAltText('Selected one.png')).toBeVisible();
  await gallery.getByRole('button', { name: 'Upload selected images', exact: true }).click();
  await expect(gallery.getByRole('button', { name: 'Set image 4 as main' })).toBeVisible();
  await gallery.getByRole('button', { name: 'Set image 4 as main' }).click();
  await chooseImageFiles(page, gallery, 'Replace image 1', file('replacement.png'));
  await gallery.getByRole('button', { name: 'Upload selected images', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Save changes', exact: true })).toBeEnabled();
  await gallery.getByRole('button', { name: 'Move image 4 up' }).click();
  for (const width of [1440, 768, 320]) {
    await page.setViewportSize({ width, height: 900 });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  }
  await gallery.screenshot({ path: 'test-results/batch2-gallery-320.png' });
  await page.getByRole('button', { name: 'Save changes', exact: true }).click();
  await expect.poll(() => fixture.saves.length).toBe(1);
  const payload = fixture.saves[0].payload;
  expect(payload.galleryKeys).toEqual([`catalog-media/v1/${'3'.padStart(64, '0')}.png`, adminProduct.galleryKeys[0], `catalog-media/v1/${'1'.padStart(64, '0')}.png`, adminProduct.galleryKeys[1]]);
  expect(payload.mainImageKey).toBe(payload.galleryKeys[0]); expect(payload.expectedRevision).toBe(0);
  expect(errors).toEqual([]);
});
test('invalid files and failed upload cannot save or replace the original primary; retry works', async ({ page }) => {
  const fixture = await mockCatalog(page, { role: 'admin' }); const storage = await mediaFixture(page);
  await page.goto(`/admin/products/${adminProduct._id}/edit`);
  const gallery = page.getByRole('region', { name: 'Product images', exact: true });
  await chooseImageFiles(page, gallery, 'Add images', { name: 'bad.svg', mimeType: 'image/svg+xml', buffer: Buffer.from('<svg/>') });
  await expect(gallery.getByRole('alert')).toContainText('JPEG, PNG or WebP');
  storage.fail(true);
  await chooseImageFiles(page, gallery, 'Replace image 1', file('replacement.png'));
  await gallery.getByRole('button', { name: 'Upload selected images' }).click();
  await expect(gallery.getByRole('alert')).toContainText('storage unavailable');
  expect(fixture.saves).toHaveLength(0);
  await expect(page.getByRole('button', { name: 'Save changes', exact: true })).toBeDisabled();
  await expect(gallery.getByAltText('Image 1, primary')).toHaveAttribute('src', `https://fixture.invalid/${adminProduct.galleryKeys[0]}`);
  storage.fail(false); await gallery.getByRole('button', { name: 'Upload selected images' }).click();
  await expect(page.getByRole('button', { name: 'Save changes', exact: true })).toBeEnabled();
});
test('category image upload saves only the new reference and loaded revision', async ({ page }) => {
  await mockCatalog(page, { role: 'admin' }); await mediaFixture(page);
  const writes = [];
  await page.route(`**/api/v1/admin/categories/${category._id}`, async route => {
    if (route.request().method() === 'OPTIONS') return route.fulfill({ status: 204, headers: cors });
    const patch = route.request().postDataJSON(); writes.push(patch);
    return route.fulfill({ headers: cors, json: { ok: true, data: { category: { ...category, ...patch, revision: 1 } } } });
  });
  await page.goto('/admin/website/categories');
  await page.getByRole('button', { name: 'Edit', exact: true }).first().click();
  const gallery = page.getByRole('region', { name: 'Category image', exact: true });
  await chooseImageFiles(page, gallery, 'Add image', file('category.png'));
  await gallery.getByRole('button', { name: 'Upload selected images' }).click();
  await page.getByRole('button', { name: 'Save category', exact: true }).click();
  await expect.poll(() => writes.length).toBe(1);
  expect(writes[0].expectedRevision).toBe(0); expect(writes[0].slug).toBe(category.slug);
  expect(writes[0].imageKey).toMatch(/^catalog-media\/v1\//);
});
test('duplicate selection is not added twice and stale save retains the uploaded draft', async ({ page }) => {
  await mockCatalog(page, { role: 'admin' }); await mediaFixture(page, { duplicate: true });
  await page.route(`**/api/v1/admin/products/${adminProduct._id}`, async route => {
    if (route.request().method() === 'OPTIONS') return route.fulfill({ status: 204, headers: cors });
    if (route.request().method() !== 'PATCH') return route.fallback();
    return route.fulfill({ status: 409, headers: cors, json: { ok: false, error: { code: 'EDIT_CONFLICT', message: 'Product changed.' } } });
  });
  await page.goto(`/admin/products/${adminProduct._id}/edit`);
  const gallery = page.getByRole('region', { name: 'Product images', exact: true });
  await chooseImageFiles(page, gallery, 'Add images', Array.from({ length: 24 }, (_, index) => file(`${index}.png`)));
  await expect(gallery.getByRole('alert')).toContainText('at most 23');
  await chooseImageFiles(page, gallery, 'Add images', [file('same.png'), file('same-again.png')]);
  await gallery.getByRole('button', { name: 'Upload selected images' }).click();
  await expect(gallery.getByRole('alert')).toContainText('duplicate was not added');
  await expect(gallery.getByAltText(/^Image \d/)).toHaveCount(3);
  await page.getByRole('button', { name: 'Save changes', exact: true }).click();
  await expect(page.getByText('Another editor changed this record.', { exact: false })).toBeVisible();
  await expect(gallery.getByAltText(/^Image \d/)).toHaveCount(3);
  await expect(page.getByRole('button', { name: 'Reload latest record', exact: true })).toBeVisible();
});
test('existing component editor includes uploaded gallery in the normal guarded save', async ({ page }) => {
  await mockCommerce(page, { role: 'admin' }); await mediaFixture(page);
  const writes = [];
  await page.route('**/api/v1/admin/commerce/components/*', async route => {
    if (route.request().method() === 'OPTIONS') return route.fulfill({ status: 204, headers: cors });
    if (route.request().method() !== 'PATCH') return route.fallback();
    const patch = route.request().postDataJSON(); writes.push(patch);
    return route.fulfill({ headers: cors, json: { ok: true, data: { component: { _id: '710000000000000000000030', ...patch, revision: 1 } } } });
  });
  await page.goto('/admin/commerce/components');
  await page.getByRole('button', { name: /^Edit Configured Card/ }).click();
  const gallery = page.getByRole('region', { name: 'Component images', exact: true });
  await chooseImageFiles(page, gallery, 'Add images', file('discard-on-close.png'));
  await expect(page.getByRole('button', { name: 'Save configuration' })).toBeDisabled();
  await page.getByRole('button', { name: 'Close editor', exact: true }).click();
  await page.getByRole('button', { name: /^Edit Configured Card/ }).click();
  await expect(gallery.getByAltText('Selected discard-on-close.png')).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Save configuration' })).toBeEnabled();
  await chooseImageFiles(page, gallery, 'Add images', file('component.png'));
  await gallery.getByRole('button', { name: 'Upload selected images' }).click();
  await page.getByRole('button', { name: 'Save configuration' }).click();
  await expect.poll(() => writes.length).toBe(1);
  expect(writes[0].galleryKeys).toHaveLength(1); expect(writes[0].mainImageKey).toBe(writes[0].galleryKeys[0]); expect(writes[0].expectedRevision).toBe(0);
});

test('stopping an in-flight admin upload preserves references and retries the remaining selection', async ({ page }) => {
  const fixture = await mockCatalog(page, { role: 'admin' }); await mediaFixture(page);
  let release, count = 0; const stalled = new Promise(resolve => { release = resolve; });
  await page.route('**/api/v1/admin/media', async route => {
    if (route.request().method() === 'OPTIONS') return route.fulfill({ status: 204, headers: cors });
    count++; if (count === 1) await stalled;
    await route.fulfill({ status: 201, headers: cors, json: { ok: true, data: { image: { key: `catalog-media/v1/${'9'.repeat(64)}.png`, width: 1, height: 1 } } } }).catch(() => {});
  });
  await page.goto(`/admin/products/${adminProduct._id}/edit`); const gallery = page.getByRole('region', { name: 'Product images', exact: true });
  await chooseImageFiles(page, gallery, 'Add images', file('interrupted.png'));
  await gallery.getByRole('button', { name: 'Upload selected images' }).click(); await expect.poll(() => count).toBe(1);
  await gallery.getByRole('button', { name: 'Stop upload' }).click(); release();
  await expect(gallery.getByRole('alert')).toContainText('Upload stopped'); await expect(page.getByRole('button', { name: 'Save changes', exact: true })).toBeDisabled();
  await expect(gallery.getByAltText('Image 1, primary')).toHaveAttribute('src', `https://fixture.invalid/${adminProduct.galleryKeys[0]}`); expect(fixture.saves).toHaveLength(0);
  await gallery.getByRole('button', { name: 'Upload selected images' }).click(); await expect.poll(() => count).toBe(2);
  await expect(page.getByRole('button', { name: 'Save changes', exact: true })).toBeEnabled();
});
