import { expect, test } from '@playwright/test';
import { ASSET_VERSION, FIXED_COMPONENTS } from '../../shared/gift-box/definitions.mjs';
import { giftBoxFixture as fixture, beginGiftBox as begin } from './gift-box-fixtures.js';

test.beforeEach(async ({ page }) => { const errors = []; page.on('pageerror', error => errors.push(error.message)); page.__giftBoxErrors = errors; });
test.afterEach(async ({ page }) => { expect(page.__giftBoxErrors).toEqual([]); });


// Shopping and personalization interaction coverage: gift-box-redesign.spec.js.
test('saved option order is retained and media loads only the current category and selected placements', async ({ page }) => {
  const f = await fixture(page);
  const lastPlush = f.components.splice(f.components.findIndex(item => item.componentId === 'plush-17'), 1)[0]; f.components.unshift(lastPlush);
  await begin(page);
  expect(f.media.every(path => path.includes('/boxes/'))).toBe(true);
  expect(f.media.filter(path => path.includes('/1200/')).every(path => /\/1200\/boxes\/box-(?:[1-9]|1[0-2])-open-top\.webp$/.test(path))).toBe(true);
  expect(f.media.some(path => path.endsWith('/1200/boxes/box-2-open-top.webp'))).toBe(true);
  await page.locator('.gb-progress button').nth(2).click(); await expect(page.locator('.gb-options-plush .gb-option').first()).toContainText('Fixture plush-17');
  // Visible option cards use the same transparent builder artwork as placement.
  await expect.poll(() => f.media.some(path => path.endsWith('/1200/toys/plush-17-builder.webp'))).toBe(true);
  expect(f.media.some(path => /\/1200\/(?:flowers|chocolate)\//.test(path))).toBe(false);
  await page.getByRole('button', { name: 'Add Fixture plush-17', exact: true }).click(); await expect.poll(() => f.media.some(path => path.endsWith('/1200/toys/plush-17-builder.webp'))).toBe(true);
});
test('local media rejects references, defective artwork, unexpected paths and cross-origin reads', async ({ page, request }) => {
  await fixture(page); await page.goto('/dev/gift-box/geometry');
  const prefix = `/__gift-box-local/${ASSET_VERSION}`;
  for (const path of ['/1200/boxes/box-1-open-top.webp', '/320/ribbons/ribbons.jpeg', '/development-manifest.json', '/1200/chocolate/chocolate-21-builder.webp']) expect((await request.get(prefix + path)).status()).toBe(404);
  expect((await request.get(`${prefix}/1200/boxes/box-2-open-top.webp`, { headers: { Origin: 'https://unapproved.example' } })).status()).toBe(404);
  const allowed = await request.get(`${prefix}/1200/boxes/box-2-open-top.webp`); expect(allowed.status()).toBe(200); expect(allowed.headers()['content-type']).toBe('image/webp'); expect(allowed.headers()['cache-control']).toContain('no-store');
  const overlay = '/__gift-box-box1-overlay/box1-alpha-rgb-2026-10-31.1/1200/boxes/box-1-open-top.webp';
  const reviewed = await request.get(overlay); expect(reviewed.status()).toBe(200); expect(reviewed.headers()['content-type']).toBe('image/webp');
  expect((await request.get(overlay, { headers: { Origin: 'https://unapproved.example' } })).status()).toBe(404);
  expect((await request.get(overlay.replace('/1200/', '/640/'))).status()).toBe(404);
});
test('unpriced options and known broken artwork stay disabled; catalog and estimate failures can recover', async ({ page }) => {
  const f = await fixture(page, { failCatalog: true, failEstimate: true, directCommerceEnabled: true }); await page.goto('/customize/gift-box'); await expect(page.getByRole('alert')).toContainText('not enabled'); f.recoverCatalog(); await page.getByRole('button', { name: 'Retry choices' }).click();
  await expect(page.getByRole('button', { name: 'Choose Fixture box-1', exact: true })).toBeDisabled(); await page.getByRole('button', { name: 'Choose Fixture box-2', exact: true }).click();
  await expect(page.getByRole('alert')).toContainText('price needs approval'); f.recoverEstimate(); await page.getByRole('button', { name: 'Retry total' }).click(); await expect(page.locator('.gb-live-total strong')).toContainText('10.00');
  const g = await fixture(page, { unpriced: true, directCommerceEnabled: true }); await page.reload(); await expect(page.locator('.gb-option:not(:disabled)')).toHaveCount(0); expect(g.components.every(item => item.pricePiastres === null)).toBe(true);
});
test('owner-reviewed availability activates all 74 settings without touching approved prices', async ({ page }) => {
  const f = await fixture(page, { role: 'admin', componentOverrides: Object.fromEntries(FIXED_COMPONENTS.map(item =>
    [item.id, { enabled: false, available: false, inventoryMode: item.category === 'ribbon' ? 'status_only' : null, inventoryQuantity: null }])) });
  await page.goto('/admin/gift-box/components');
  await page.getByRole('button', { name: 'Review all component availability' }).click();
  await expect(page.getByRole('region', { name: 'Availability plan' })).toContainText('74 to update');
  await page.getByRole('checkbox', { name: /I confirm all 74 components are available/ }).check();
  await page.getByRole('button', { name: 'Save 74 availability updates' }).click();
  await expect(page.getByRole('region', { name: 'Made to order availability' }))
    .toContainText('All 74 components are enabled and available', { timeout: 30000 });
  expect(f.patches).toHaveLength(74);
  for (const { body } of f.patches) {
    expect(body.enabled).toBe(true);
    expect(body.available).toBe(true);
    expect(Object.hasOwn(body, 'pricePiastres')).toBe(false);
    expect(Object.hasOwn(body, 'inventoryQuantity')).toBe(false);
  }
  expect(f.patches.filter(({ body }) => body.inventoryMode === 'made_to_order')).toHaveLength(53);
});
test('admin exposes only fixed editable settings and sends revisions and explicit complimentary intent', async ({ page }) => {
  const f = await fixture(page, { role: 'admin' }); await page.goto('/admin/gift-box/components');
  const form = page.locator('.gb-setting-editor').filter({ hasText: 'box-2 · box · revision' });
  await form.getByLabel('Display name', { exact: true }).fill('Renamed fixture box'); await form.getByLabel('Approved price (EGP)').fill('0'); await form.getByLabel('Explicitly approve this component as complimentary').check(); await form.getByRole('button', { name: 'Save component settings' }).click();
  await expect(form.getByRole('status')).toHaveText('Component settings saved.');
  expect(f.patches[0].body).toEqual({ expectedRevision: 1, displayName: 'Renamed fixture box', displayOrder: 2, enabled: true, available: true, pricePiastres: 0, confirmComplimentary: true });
  await expect(page.getByRole('button', { name: /Create|Delete|Replace image/ })).toHaveCount(0); await expect(page.locator('input[type=file]')).toHaveCount(0);
  await page.getByText('Reorder boxes', { exact: true }).click(); await page.getByRole('button', { name: 'Move box-3 up', exact: true }).click(); await page.getByRole('button', { name: 'Save category order' }).click();
  // A name save advances a revision: the reorder snapshot must fail or refresh, never overwrite silently.
  expect(f.patches.at(-1).body.items).toHaveLength(12);
  await expect(page.locator('.gb-order').getByText(/unsaved changes are still here/)).toBeVisible();
});
test('admin conflict retains draft until deliberate reload, and customer cannot open the editor', async ({ page }) => {
  await fixture(page, { role: 'admin', conflict: true }); await page.goto('/admin/gift-box/components'); const form = page.locator('.gb-setting-editor').first();
  await form.getByLabel('Display name', { exact: true }).fill('Keep this draft'); await form.getByRole('button', { name: 'Save component settings' }).click(); await expect(form.getByText(/unsaved changes are still here/)).toBeVisible(); await expect(form.getByLabel('Display name', { exact: true })).toHaveValue('Keep this draft');
  await form.getByRole('button', { name: 'Reload latest record' }).click(); await form.getByRole('button', { name: 'Confirm reload and discard draft' }).click(); await expect(form.getByLabel('Display name', { exact: true })).toHaveValue('Fixture box-1');
  await fixture(page, { role: 'customer' }); await page.reload(); await expect(page.locator('.gb-setting-editor')).toHaveCount(0);
});
test('local geometry drafts stay unreviewed, support compartments and keep the source defect blocked', async ({ page }, testInfo) => {
  await fixture(page); await page.goto('/dev/gift-box/geometry'); await expect(page.getByText(/Current registry: unreviewed/)).toBeVisible();
  await page.getByLabel('Review box').selectOption('box-11'); await page.getByLabel('Region shape').selectOption('ellipse'); await page.getByRole('button', { name: 'Add draft region', exact: true }).click();
  await page.getByLabel('Placement zone').selectOption('beside'); await page.getByRole('button', { name: 'Add draft region', exact: true }).click();
  const json = JSON.parse(await page.getByLabel('Geometry review draft JSON').inputValue()); expect(json.reviewStatus).toBe('unreviewed'); expect(json.capacity).toBeNull(); expect(json.regions).toHaveLength(3); expect(json.besideRegions).toHaveLength(2);
  await page.getByRole('button', { name: 'Add study sample' }).click(); await expect(page.getByText(/authoritative result: GEOMETRY_REVIEW_REQUIRED/)).toBeVisible();
  await page.screenshot({ path: testInfo.outputPath('geometry-compartments.png'), fullPage: true });
  await page.getByLabel('Review box').selectOption('box-1'); await expect(page.locator('.gb-geometry .gb-box-art img')).toBeVisible();
});
for (const width of [320, 390, 768, 1440]) test(`builder and admin fit ${width}px with real local artwork and reduced motion`, async ({ page }, testInfo) => {
  await page.setViewportSize({ width, height: 1000 }); await page.emulateMedia({ reducedMotion: 'reduce' }); await fixture(page, { role: 'admin' }); await begin(page);
  await expect(page.locator('.gb-box-art img')).toBeVisible(); await expect.poll(() => page.locator('.gb-box-art img').evaluate(img => img.complete && img.naturalWidth > 0)).toBe(true);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  await page.evaluate(() => { document.activeElement?.blur(); window.scrollTo({ top: 0, left: 0, behavior: 'instant' }); });
  await page.screenshot({ path: testInfo.outputPath(`builder-${width}.png`), fullPage: true });
  await page.goto('/admin/gift-box/components'); await expect(page.locator('.gb-setting-editor')).toHaveCount(12); expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
});
test('all twelve source box shapes have local visual review outputs without geometry approval', async ({ page }, testInfo) => {
  await fixture(page); await page.goto('/dev/gift-box/geometry');
  for (let n = 1; n <= 12; n++) {
    await page.getByLabel('Review box').selectOption(`box-${n}`);
    await expect(page.getByText(/Current registry: unreviewed/)).toBeVisible();
    if (n > 1) await expect.poll(() => page.locator('.gb-box-art img').evaluate(img => img.complete && img.naturalWidth > 0)).toBe(true);
    await page.locator('.gb-geometry .gb-workspace>section').first().screenshot({ path: testInfo.outputPath(`geometry-box-${n}.png`) });
  }
});
