import { expect, test } from '@playwright/test';
import { ASSET_VERSION } from '../../shared/gift-box/definitions.mjs';
import { giftBoxFixture as fixture, beginGiftBox as begin } from './gift-box-fixtures.js';

test.beforeEach(async ({ page }) => { const errors = []; page.on('pageerror', error => errors.push(error.message)); page.__giftBoxErrors = errors; });
test.afterEach(async ({ page }) => { expect(page.__giftBoxErrors).toEqual([]); });

test('12-option slices persist across all steps and chocolate selectors are text only', async ({ page }, testInfo) => {
  const f = await fixture(page); await begin(page);
  await expect(page.locator('.gb-options-box .gb-option')).toHaveCount(12); await expect(page.getByRole('button', { name: /Load More/ })).toHaveCount(0);
  await page.getByRole('button', { name: 'Next', exact: true }).click(); await expect(page.locator('.gb-options-flower .gb-option')).toHaveCount(3);
  await page.getByRole('button', { name: 'Add Fixture rose-red', exact: true }).click();
  await page.getByRole('button', { name: 'Add Fixture rose-red', exact: true }).click();
  await page.getByRole('button', { name: 'Next', exact: true }).click(); await expect(page.locator('.gb-options-plush .gb-option')).toHaveCount(12);
  await page.getByRole('button', { name: /Load More/ }).click(); await expect(page.locator('.gb-options-plush .gb-option')).toHaveCount(17); await expect(page.getByRole('button', { name: /Load More/ })).toHaveCount(0);
  await page.getByRole('button', { name: 'Add Fixture plush-17', exact: true }).click();
  await page.getByRole('button', { name: 'Next', exact: true }).click(); await expect(page.locator('.gb-options-chocolate .gb-option')).toHaveCount(12);
  await expect(page.locator('.gb-options-chocolate img')).toHaveCount(0); await page.getByRole('button', { name: /Load More/ }).click(); await expect(page.locator('.gb-options-chocolate .gb-option')).toHaveCount(20);
  await page.getByRole('button', { name: 'Add Fixture chocolate-20', exact: true }).click(); await page.getByRole('button', { name: 'Add Fixture chocolate-20', exact: true }).click();
  await expect(page.locator('.gb-placed')).toHaveCount(5);
  await expect.poll(() => f.estimates.at(-1)?.items).toEqual([{ componentId: 'chocolate-20', quantity: 2 }, { componentId: 'plush-17', quantity: 1 }, { componentId: 'rose-red', quantity: 2 }]);
  await page.getByRole('button', { name: 'Back', exact: true }).click(); await expect(page.locator('.gb-options-plush .gb-option')).toHaveCount(17);
  await page.getByRole('button', { name: 'Next', exact: true }).click(); await expect(page.locator('.gb-options-chocolate .gb-option')).toHaveCount(20);
  expect(f.calls.filter(call => call.path.endsWith('/catalog'))).toHaveLength(1);
  expect(f.media.some(path => path.includes('/1200/chocolate/chocolate-20-builder.webp'))).toBe(true);
  await page.evaluate(() => { document.activeElement?.blur(); window.scrollTo({ top: 0, left: 0, behavior: 'instant' }); });
  await page.screenshot({ path: testInfo.outputPath('mixed-arrangement-study.png'), fullPage: true });
});
test('saved option order is retained and media loads only the current category and selected placements', async ({ page }) => {
  const f = await fixture(page);
  const lastPlush = f.components.splice(f.components.findIndex(item => item.componentId === 'plush-17'), 1)[0]; f.components.unshift(lastPlush);
  await begin(page);
  expect(f.media.every(path => path.includes('/boxes/'))).toBe(true);
  expect(f.media.filter(path => path.includes('/1200/')).every(path => path.endsWith('/box-2-open-top.webp'))).toBe(true);
  await page.locator('.gb-steps button').nth(2).click(); await expect(page.locator('.gb-options-plush .gb-option').first()).toContainText('Fixture plush-17');
  expect(f.media.some(path => path.includes('/1200/toys/'))).toBe(false);
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
test('drag, keyboard moves, quantity changes, undo and clear preserve price separation', async ({ page }) => {
  const f = await fixture(page); await begin(page); await page.getByRole('button', { name: 'Next', exact: true }).click();
  await page.getByRole('button', { name: 'Add Fixture rose-red', exact: true }).click();
  await expect(page.locator('.gb-price-summary strong')).toContainText('20.00');
  const item = page.locator('.gb-placed').first(), id = await item.getAttribute('data-instance-id'), before = await item.getAttribute('style');
  const requests = f.estimates.length;
  const bounds = await item.boundingBox(); await page.mouse.move(bounds.x + bounds.width / 2, bounds.y + bounds.height / 2); await page.mouse.down(); await page.mouse.move(bounds.x + bounds.width / 2 + 35, bounds.y + bounds.height / 2 + 18, { steps: 5 }); await page.mouse.up();
  await expect(item).not.toHaveAttribute('style', before); await item.focus(); await page.keyboard.press('ArrowLeft'); await page.getByRole('button', { name: 'Move up', exact: true }).click();
  expect(f.estimates).toHaveLength(requests); expect(await item.getAttribute('data-instance-id')).toBe(id);
  await page.getByRole('button', { name: 'Add one Fixture rose-red', exact: true }).click(); await expect(page.locator('.gb-placed')).toHaveCount(2);
  await page.getByRole('button', { name: 'Remove one Fixture rose-red', exact: true }).click(); await expect(page.locator('.gb-placed')).toHaveCount(1);
  await page.getByRole('button', { name: 'Undo', exact: true }).click(); await expect(page.locator('.gb-placed')).toHaveCount(2);
  await page.getByRole('button', { name: 'Clear items', exact: true }).click(); await expect(page.locator('.gb-placed')).toHaveCount(0);
  await page.getByRole('button', { name: 'Undo', exact: true }).click(); await expect(page.locator('.gb-placed')).toHaveCount(2);
});
test('box changes stage existing items, retain quantities and allow undo', async ({ page }) => {
  await fixture(page); await begin(page); await page.getByRole('button', { name: 'Next', exact: true }).click(); await page.getByRole('button', { name: 'Add Fixture rose-yellow', exact: true }).click();
  await page.getByRole('button', { name: 'Back', exact: true }).click(); await page.getByRole('button', { name: 'Choose Fixture box-11', exact: true }).click();
  await expect(page.locator('.gb-placed')).toHaveCount(0); await expect(page.getByText('Items waiting for placement')).toBeVisible(); await expect(page.locator('.gb-item-list')).toContainText('Fixture rose-yellow × 1');
  await page.getByRole('button', { name: 'Undo', exact: true }).click(); await expect(page.locator('.gb-placed')).toHaveCount(1); await expect(page.getByRole('button', { name: 'Choose Fixture box-2', exact: true })).toHaveAttribute('aria-pressed', 'true');
});
test('approved card supports an optional 500-code-point message without enabling submission', async ({ page }) => {
  const f = await fixture(page); await begin(page); await page.locator('.gb-steps button').nth(5).click();
  await expect(page.locator('.gb-options-ribbon button')).toHaveCount(12);
  await page.getByLabel('Add a gift card').check(); await page.getByLabel('Your personal message').fill('💐'.repeat(500)); await expect(page.getByText('500 / 500 characters')).toBeVisible();
  await page.getByLabel('Your personal message').press('a'); await expect(page.getByLabel('Your personal message')).toHaveValue('💐'.repeat(500));
  await expect(page.locator('.gb-price-summary strong')).toContainText('20.00'); await page.getByRole('button', { name: 'Next: Review' }).click();
  await expect(page.getByRole('button', { name: 'Add completed gift to cart', exact: true })).toBeDisabled();
  expect(f.estimates.at(-1).giftCard).toEqual({ componentId: 'gift-card-1', message: '💐'.repeat(500) });
  expect(f.calls.every(call => !/submit|convert|order/.test(call.path))).toBe(true);
});
test('unpriced options and known broken artwork stay disabled; catalog and estimate failures can recover', async ({ page }) => {
  const f = await fixture(page, { failCatalog: true, failEstimate: true }); await page.goto('/customize/gift-box'); await expect(page.getByRole('alert')).toContainText('not enabled'); f.recoverCatalog(); await page.getByRole('button', { name: 'Retry choices' }).click();
  await expect(page.getByRole('button', { name: 'Choose Fixture box-1', exact: true })).toBeDisabled(); await page.getByRole('button', { name: 'Choose Fixture box-2', exact: true }).click();
  await expect(page.getByRole('alert')).toContainText('price needs approval'); f.recoverEstimate(); await page.getByRole('button', { name: 'Retry estimate' }).click(); await expect(page.locator('.gb-price-summary strong')).toContainText('10.00');
  const g = await fixture(page, { unpriced: true }); await page.reload(); await expect(page.locator('.gb-option:not(:disabled)')).toHaveCount(0); expect(g.components.every(item => item.pricePiastres === null)).toBe(true);
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
test.describe('touch layout study', () => {
  test.use({ hasTouch: true, isMobile: true, viewport: { width: 390, height: 844 } });
  test('touch movement changes one instance without a new price request', async ({ page, context }) => {
    const f = await fixture(page); await begin(page); await page.getByRole('button', { name: 'Next', exact: true }).click(); await page.getByRole('button', { name: 'Add Fixture rose-black', exact: true }).tap();
    await expect(page.locator('.gb-price-summary strong')).toContainText('20.00');
    const item = page.locator('.gb-placed'); await item.scrollIntoViewIfNeeded(); const before = await item.getAttribute('style'), bounds = await item.boundingBox(), count = f.estimates.length;
    const cdp = await context.newCDPSession(page), point = { x: bounds.x + bounds.width / 2, y: bounds.y + bounds.height / 2 };
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ ...point, id: 1 }] });
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: point.x + 35, y: point.y + 20, id: 1 }] });
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
    await expect(item).not.toHaveAttribute('style', before); expect(f.estimates).toHaveLength(count); await cdp.detach();
  });
});

test('personal step retains photo previews and two literal engraving drafts without contacting commerce', async ({ page }) => {
  const f = await fixture(page); await begin(page);
  await page.locator('.gb-steps button').nth(4).click();
  await expect(page.getByRole('heading', { name: 'Make It Personal' })).toBeVisible();
  const file = { name: 'family.png', mimeType: 'image/png', buffer: Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+zCCkAAAAASUVORK5CYII=', 'base64') };
  await page.getByLabel('Add special photos').setInputFiles(file);
  await expect(page.getByRole('img', { name: 'Selected photo 1' })).toBeVisible();
  await page.getByLabel('Engraving 1 (optional)').fill('١٢ / ١٠ / ٢٠٢٦');
  await page.getByRole('button', { name: '+ Add another engraving' }).click();
  await page.getByLabel('Engraving 2 (optional)').fill('Forever yours');
  await page.getByRole('group', { name: 'Engraving 2 lettering styles' }).getByRole('button', { name: 'Style 12' }).click();
  await expect(page.getByRole('img', { name: 'Selected photo 1' })).toHaveCount(1);
  await page.locator('.gb-steps button').nth(5).click();
  await expect(page.getByRole('img', { name: 'Selected photo 1' })).toBeVisible();
  await page.getByRole('button', { name: 'Next: Review' }).click();
  await expect(page.getByText('1 selected photo(s); 2 engraving(s). Not uploaded or priced.')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Add completed gift to cart', exact: true })).toBeDisabled();
  expect(f.calls.filter(call => ['upload', 'cart/items', 'orders'].some(fragment => call.path.includes(fragment)))).toHaveLength(0);
});


test('local photo prints move inside/beside by controls, keyboard and pointer without repricing or upload', async ({ page }) => {
  const f=await fixture(page); await begin(page); await page.locator('.gb-steps button').nth(4).click();
  const file={name:'memory.png',mimeType:'image/png',buffer:Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+zCCkAAAAASUVORK5CYII=','base64')};
  await page.getByLabel('Add special photos').setInputFiles(file);
  const print=page.locator('.gb-photo-on-box');
  await expect(print).toHaveCount(1);
  await expect(print).toHaveAttribute('data-zone','beside');
  await expect(page.getByRole('img',{name:'Selected photo 1'})).toHaveCount(1);
  const id=await print.getAttribute('data-photo-id');
  const requests=f.estimates.length, before=await print.getAttribute('style');
  await print.locator('button').focus(); await page.keyboard.press('ArrowUp');
  await expect(print).not.toHaveAttribute('style',before);
  await page.getByRole('button',{name:'Move photo inside (draft)'}).click();
  await expect(print).toHaveAttribute('data-zone','inside');
  // Root-cause regression: Playwright scrollIntoViewIfNeeded checked viewport
  // intersection, but a sticky step-nav covered the photo's center. The old
  // pointer press hit the navigation overlay and selected text, not this handle.
  // Return to the stable top-of-page view and verify the real pointer target.
  await page.evaluate(async () => {
    document.documentElement.style.scrollBehavior = 'auto';
    window.scrollTo({ top: 0, left: 0, behavior: 'instant' });
    await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
  });
  const handle = print.locator('.gb-photo-handle');
  await expect.poll(() => handle.evaluate(node => {
    const rect = node.getBoundingClientRect();
    const x = rect.left + rect.width / 2, y = rect.top + rect.height / 2;
    const hit = document.elementFromPoint(x, y);
    return rect.width > 0 && rect.height > 0 &&
      x >= 0 && x < innerWidth && y >= 0 && y < innerHeight &&
      (hit === node || node.contains(hit));
  }), { message: 'Photo drag handle must be the unobstructed hit target' }).toBe(true);
  const c = await page.locator('.gb-canvas').boundingBox();
  const p = await handle.boundingBox();
  const source = { x: p.x + p.width / 2, y: p.y + p.height / 2 };
  const target = { x: c.x + c.width * .82, y: c.y + c.height * .56 };
  expect(await page.evaluate(({x,y}) => {
    const canvas = document.querySelector('.gb-canvas');
    return !!canvas && canvas.contains(document.elementFromPoint(x,y));
  }, target)).toBe(true);
  await page.mouse.move(source.x, source.y); await page.mouse.down();
  await page.mouse.move(target.x, target.y, { steps: 8 }); await page.mouse.up();
  await expect(print).toHaveAttribute('data-zone','beside');
  expect(await print.getAttribute('data-photo-id')).toBe(id);
  expect(f.estimates).toHaveLength(requests);
  expect(f.calls.filter(call=>/upload|cart\/items|orders/.test(call.path))).toHaveLength(0);
  await page.getByRole('button',{name:'Remove photo 1'}).click();
  await expect(print).toHaveCount(0);
  await expect(page.getByRole('img',{name:'Selected photo 1'})).toHaveCount(0);
});

test('changing the gift box keeps local photo files but resets their draft placement', async ({ page }) => {
  const f=await fixture(page); await begin(page); await page.locator('.gb-steps button').nth(4).click();
  const file={name:'memory.png',mimeType:'image/png',buffer:Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+zCCkAAAAASUVORK5CYII=','base64')};
  await page.getByLabel('Add special photos').setInputFiles(file);
  const print=page.locator('.gb-photo-on-box');
  const id=await print.getAttribute('data-photo-id');
  await print.locator('button').click(); await page.getByRole('button',{name:'Move photo inside (draft)'}).click();
  await expect(print).toHaveAttribute('data-zone','inside');
  await page.locator('.gb-steps button').nth(0).click();
  await page.getByRole('button',{name:'Choose Fixture box-3',exact:true}).click();
  await expect(print).toHaveAttribute('data-zone','beside');
  await expect(print).toHaveAttribute('data-photo-id',id);
  await expect(page.getByRole('img',{name:'Selected photo 1'})).toHaveCount(1);
  expect(f.calls.filter(call=>/upload|cart\/items|orders/.test(call.path))).toHaveLength(0);
});

test('dragging a chocolate across the box edge changes its zone without repricing', async ({ page }) => {
  const f = await fixture(page); await begin(page); await page.locator('.gb-steps button').nth(3).click();
  await page.getByRole('button', { name: 'Add Fixture chocolate-1', exact: true }).click();
  const item = page.locator('.gb-placed').first();
  const canvas = page.locator('.gb-canvas');
  await item.scrollIntoViewIfNeeded();
  const itemBounds = await item.boundingBox(), canvasBounds = await canvas.boundingBox();
  const requests = f.estimates.length;
  const start = { x: itemBounds.x + itemBounds.width/2, y: itemBounds.y + itemBounds.height/2 };
  const outside = { x: canvasBounds.x + canvasBounds.width*0.81, y: canvasBounds.y + canvasBounds.height*0.59 };
  await page.mouse.move(start.x,start.y); await page.mouse.down();
  await page.mouse.move(outside.x,outside.y,{steps:8}); await page.mouse.up();
  await item.click();
  await expect(page.getByRole('button', { name: 'Move inside (draft)' })).toBeVisible();
  expect(f.estimates).toHaveLength(requests);
  await page.getByRole('button', { name: 'Move inside (draft)' }).click();
  await expect(page.getByRole('button', { name: 'Move beside box (draft)' })).toBeVisible();
  expect(f.estimates).toHaveLength(requests);
});

test('a chocolate may be moved beside and returned inside in the dev layout without repricing', async ({ page }) => {
  const f = await fixture(page); await begin(page);
  await page.locator('.gb-steps button').nth(3).click();
  await page.getByRole('button', { name: 'Add Fixture chocolate-1', exact: true }).click();
  await page.locator('.gb-placed').first().click();
  const before = f.estimates.length;
  await page.getByRole('button', { name: 'Move beside box (draft)' }).click();
  await expect(page.getByRole('button', { name: 'Move inside (draft)' })).toBeVisible();
  await page.getByRole('button', { name: 'Move inside (draft)' }).click();
  await expect(page.getByRole('button', { name: 'Move beside box (draft)' })).toBeVisible();
  expect(f.estimates).toHaveLength(before);
});


test('engraving colors stay independent, literal and preview-only across steps', async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 844 });
  const f = await fixture(page); await begin(page);
  await expect(page.locator('.gb-price-summary strong')).toContainText('10.00');
  const estimateCalls = f.estimates.length;
  await page.locator('.gb-steps button').nth(4).click();
  const original = '١٢ / ١٠ / ٢٠٢٦ 💛';
  await page.getByLabel('Engraving 1 (optional)').fill(original);
  const firstColors = page.getByRole('group', { name: 'Engraving 1 colors' });
  await expect(firstColors.getByRole('button')).toHaveCount(5);
  await firstColors.getByRole('button', { name: 'White', exact: true }).click();
  await expect(firstColors.getByRole('button', { name: 'White' })).toHaveAttribute('aria-pressed', 'true');
  await expect(page.locator('.gb-sample-paper').first()).toHaveAttribute('data-color', 'white');
  await expect(page.locator('.gb-sample-paper p').first()).toHaveCSS('color', 'rgb(255, 255, 255)');
  await expect(page.locator('.gb-sample-paper').first()).toHaveAttribute('data-preview-contrast', 'dark');
  await page.getByRole('group', { name: 'Engraving 1 lettering styles' }).getByRole('button', { name: 'Style 12' }).click();
  await page.getByRole('button', { name: '+ Add another engraving' }).click();
  const secondColors = page.getByRole('group', { name: 'Engraving 2 colors' });
  await expect(secondColors.getByRole('button')).toHaveCount(5);
  await page.getByLabel('Engraving 2 (optional)').fill('Forever yours');
  await secondColors.getByRole('button', { name: 'Red', exact: true }).click();
  // First accordion panel is collapsed after the second entry opens; its selection persists.
  await expect(page.locator('[role="group"][aria-label="Engraving 1 colors"] button[aria-label="White"]')).toHaveAttribute('aria-pressed', 'true');
  await expect(secondColors.getByRole('button', { name: 'Red' })).toHaveAttribute('aria-pressed', 'true');
  await expect(page.getByLabel('Engraving 1 (optional)')).toHaveValue(original);
  await expect(page.locator('[role="group"][aria-label="Engraving 1 lettering styles"] button').filter({ hasText: 'Style 12' })).toHaveAttribute('aria-pressed', 'true');
  await expect(page.locator('.gb-engraving-paper')).toHaveCount(2);
  await expect(page.locator('.gb-engraving-paper').first()).toHaveAttribute('data-color', 'white');
  await expect(page.locator('.gb-engraving-paper').nth(1)).toHaveAttribute('data-color', 'red');
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  await page.locator('.gb-steps button').nth(5).click();
  await expect(page.locator('.gb-engraving-paper').first()).toContainText(original);
  await expect(page.locator('.gb-engraving-paper').first()).toHaveAttribute('data-color', 'white');
  await expect(page.locator('.gb-engraving-paper').nth(1)).toHaveAttribute('data-color', 'red');
  expect(f.estimates).toHaveLength(estimateCalls);
  expect(f.calls.filter(call => /upload|cart\/items|orders|checkout|submit/.test(call.path))).toHaveLength(0);
});


test('seven local photos and three separate engravings remain editable and never touch commerce', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  const f = await fixture(page); await begin(page);
  await expect(page.locator('.gb-price-summary strong')).toContainText('10.00');
  const estimateCount = f.estimates.length;
  await page.locator('.gb-steps button').nth(4).click();
  const bytes = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+zCCkAAAAASUVORK5CYII=', 'base64');
  await page.getByLabel('Add special photos').setInputFiles(Array.from({length:7}, (_,i) => ({name:`photo-${i+1}.png`,mimeType:'image/png',buffer:bytes})));
  await expect(page.locator('.gb-photo-order li')).toHaveCount(7);
  await expect(page.locator('.gb-photo-on-box')).toHaveCount(7);
  await expect(page.getByLabel('Add special photos')).toBeEnabled();
  await page.getByLabel('Engraving 1 (optional)').fill('١٢ / ١٠ / ٢٠٢٦');
  await page.getByRole('button', {name:'+ Add another engraving'}).click();
  await page.getByLabel('Engraving 2 (optional)').fill('Second entry');
  await page.getByRole('button', {name:'+ Add another engraving'}).click();
  await page.getByLabel('Engraving 3 (optional)').fill('Third entry 💛');
  await page.getByRole('group', {name:'Engraving 3 colors'}).getByRole('button',{name:'Gold'}).click();
  await expect(page.getByRole('group', {name:'Engraving 3 colors'}).getByRole('button',{name:'Gold'})).toHaveAttribute('aria-pressed','true');
  await page.getByRole('button',{name:'Remove engraving 2'}).click();
  await expect(page.getByLabel('Engraving 2 (optional)')).toHaveValue('Third entry 💛');
  await expect(page.getByRole('group',{name:'Engraving 2 colors'}).getByRole('button',{name:'Gold'})).toHaveAttribute('aria-pressed','true');
  await expect(page.getByLabel('Engraving 1 (optional)')).toHaveValue('١٢ / ١٠ / ٢٠٢٦');
  await page.locator('.gb-steps button').nth(5).click();
  await expect(page.locator('.gb-engraving-paper')).toHaveCount(2);
  await expect(page.locator('.gb-engraving-paper').nth(1)).toHaveAttribute('data-color','gold');
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  expect(f.estimates).toHaveLength(estimateCount);
  expect(f.calls.filter(call => /upload|cart\/items|orders|checkout|submit/.test(call.path))).toHaveLength(0);
});
