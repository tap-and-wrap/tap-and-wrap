import { test, expect, api, origin, post, image, choose, open, start, words, review, add, cart, shot } from './visual-engraving-fixture.js';
test('three-step surface builder, original color layers and exact cart reconstruction at all target widths', async ({ page, context }, info) => {
  test.setTimeout(120000); const errors = [], signs = []; page.on('pageerror', error => errors.push(error.message)); page.on('request', request => { if (request.url().endsWith('/uploads/sign')) signs.push(request.postDataJSON()); });
  await page.emulateMedia({ reducedMotion: 'reduce' }); await open(page);
  await expect(page.locator('.engraving-type-grid')).toHaveCount(0); await page.getByRole('button', { name: 'Design Your Engraving', exact: true }).click(); await expect(page.getByRole('alert')).toContainText('exact surface'); await expect(page.getByRole('alert')).toBeFocused(); expect((await page.getByRole('alert').boundingBox()).y).toBeGreaterThanOrEqual(0); await expect(page.locator('.tw-builder-progress li')).toHaveCount(3);
  const surface = await image(page); await choose(page, /Engraving surface: Choose surface photo/, surface); await expect(page.locator('.sv-surface-preview .ve-surface')).toBeVisible();
  await expect(page.getByRole('radio', { name: 'Front surface', exact: true })).toHaveCount(0);
  await page.getByText('Additional item photos', { exact: true }).click(); await choose(page, 'Add overall photos', [surface, surface, surface]);
  await expect(page.getByRole('button', { name: 'Add overall photos', exact: true })).toBeDisabled();
  for (const width of [320, 390, 768, 1024, 1440]) await shot(page, info, 'your-item', width);
  await page.getByRole('button', { name: 'Design Your Engraving', exact: true }).click(); await words(page, 'ذكرى جميلة'); await page.getByRole('button', { name: 'Arabic style 2', exact: true }).click();
  await page.getByRole('radio', { name: 'grey', exact: true }).check(); for (const width of [320,390,768,1024,1440]) await shot(page, info, 'text-lettering', width); const artwork = await image(page, 400, 200); await choose(page, /Engraving artwork: Add image artwork/, artwork); await expect(page.locator('.ve-layer img')).toBeVisible();
  const stable = await page.locator('.ve-layer').last().getAttribute('style'); await page.getByRole('button', { name: 'Zoom in workspace' }).click(); expect(await page.locator('.ve-layer').last().getAttribute('style')).toBe(stable); await page.getByRole('button', { name: 'Fit view', exact: true }).click();
  await page.getByRole('button', { name: 'Move left', exact: true }).click(); await page.getByRole('button', { name: 'Larger design', exact: true }).click();
  await page.getByRole('button', { name: 'Undo', exact: true }).click(); await page.getByRole('button', { name: 'Redo', exact: true }).click();
  await page.getByRole('button', { name: 'Reset design', exact: true }).click(); const dialog = page.getByRole('dialog', { name: 'Reset your engraving design?' }); await expect(dialog).toBeVisible(); await page.keyboard.press('Escape'); await expect(dialog).toHaveCount(0); await expect(page.getByRole('button', { name: 'Reset design', exact: true })).toBeFocused();
  for (const width of [320, 390, 768, 1024, 1440]) await shot(page, info, 'design', width);
  expect(signs).toHaveLength(0); await review(page); await expect(page.getByRole('img', { name: 'Your complete engraving design' })).toBeVisible();
  for (const width of [320, 390, 768, 1024, 1440]) await shot(page, info, 'review', width);
  await page.getByRole('button', { name: 'Add to Cart', exact: true }).click(); await expect(page.getByRole('heading', { name: 'Your engraving is in the cart' })).toBeVisible();
  expect(signs.map(value => value.fieldKey).sort()).toEqual(['item_photo', 'item_photo', 'item_photo', 'personal_artwork', 'surface_photo']);
  const stored = (await cart(context)).items[0]; expect(stored.kind).toBe('engraving_service_v2');
  const before = (await (await context.request.get(`${api}/commerce/engraving/cart/${stored.id}`)).json()).data.specification;
  expect(before.itemPhotoUploadIds).toHaveLength(3); expect(before.design.layers[1].aspectRatio).toBe(2);
  const original = await context.request.get(`${api}/commerce/uploads/${before.design.layers[1].assetId}/content`); expect((await original.body()).equals(artwork.buffer)).toBe(true);
  await page.getByRole('link', { name: 'View cart', exact: true }).click(); await page.getByRole('link', { name: 'Edit engraving', exact: true }).click(); await expect(page.locator('.sv-surface-preview .ve-surface')).toBeVisible();
  await page.reload(); await expect(page.locator('.sv-surface-preview .ve-surface')).toBeVisible(); await page.getByRole('button', { name: 'Design Your Engraving', exact: true }).click();
  await expect(page.locator('.ve-layer')).toHaveCount(2); await page.getByRole('button', { name: /1\. ذكرى جميلة/ }).click(); await expect(page.getByLabel('Your text', { exact: true })).toHaveValue('ذكرى جميلة'); await expect(page.getByRole('button', { name: 'Arabic style 2', exact: true })).toHaveAttribute('aria-pressed', 'true');
  await page.getByRole('button', { name: 'Move right', exact: true }).click(); await add(page);
  expect((await cart(context)).items).toHaveLength(1); const after = (await (await context.request.get(`${api}/commerce/engraving/cart/${stored.id}`)).json()).data.specification;
  expect(after.design.layers[1]).toEqual(before.design.layers[1]); expect(after.design.layers[0].x).toBeGreaterThan(before.design.layers[0].x); expect(signs).toHaveLength(5);
  expect(JSON.stringify(await page.evaluate(() => ({ ...localStorage, ...sessionStorage })))).not.toMatch(/ذكرى|blob:|synthetic-private|surface_photo/); expect(errors).toEqual([]);
});

test('text-only add with zero overall photos recovers a lost response exactly once', async ({ page, context }) => {
  await start(page); await words(page, 'For Nour'); await review(page);
  let lost = false; await page.route('**/commerce/cart/items', async route => { if (route.request().method() === 'POST' && !lost) { lost = true; const response = await route.fetch(); expect(response.ok()).toBe(true); return route.abort('connectionreset'); } return route.continue(); });
  await page.getByRole('button', { name: 'Add to Cart', exact: true }).click(); await expect(page.getByRole('heading', { name: 'Check your cart addition' })).toBeVisible();
  await page.getByRole('button', { name: 'Check add status', exact: true }).click(); await expect(page.getByRole('heading', { name: 'Your engraving is in the cart' })).toBeVisible(); expect((await cart(context)).items).toHaveLength(1);
  const line = (await cart(context)).items[0], spec = (await (await context.request.get(`${api}/commerce/engraving/cart/${line.id}`)).json()).data.specification;
  expect(spec.itemPhotoUploadIds).toEqual([]); expect(spec.design.layers).toHaveLength(1);
});

test('touch placement, drag, pinch, keyboard size and confirmed reset use the shared editor', async ({ page, context }, info) => {
  await page.setViewportSize({ width: 390, height: 1000 }); await page.emulateMedia({ reducedMotion: 'reduce' }); await start(page); await words(page, 'For Nour');
  const board = page.locator('.ve-board'), layer = page.locator('.ve-layer'); await board.scrollIntoViewIfNeeded(); await board.evaluate(node => { const header = parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--site-header-height')) || 100; window.scrollBy(0, node.getBoundingClientRect().top - header - 24); }); const box = await board.boundingBox();
  const cdp = await context.newCDPSession(page), touch = (type, points) => cdp.send('Input.dispatchTouchEvent', { type, touchPoints: points.map((point, id) => ({ ...point, id })) });
  const tap = { x: box.x + box.width * .25, y: box.y + box.height * .3 };
  await touch('touchStart', [tap]); await touch('touchEnd', []); await expect.poll(() => layer.evaluate(node => parseFloat(node.style.left))).toBeCloseTo(25, 0);
  let rectangle = await layer.boundingBox(); const center = { x: rectangle.x + rectangle.width / 2, y: rectangle.y + rectangle.height / 2 };
  await touch('touchStart', [center]); await touch('touchMove', [{ x: center.x + 20, y: center.y + 10 }]); await touch('touchEnd', []);
  expect(await layer.evaluate(node => parseFloat(node.style.left))).toBeGreaterThan(25);
  const stable = await layer.getAttribute('style'), pinch = { x: box.x + 18, y: box.y + 18 };
  await touch('touchStart', [pinch]); await touch('touchStart', [pinch, { x: pinch.x + 40, y: pinch.y }]); await touch('touchMove', [pinch, { x: pinch.x + 70, y: pinch.y }]); await touch('touchEnd', []);
  await expect(page.getByLabel('Workspace zoom')).not.toHaveText('100%'); expect(await layer.getAttribute('style')).toBe(stable);
  await page.getByRole('button', { name: 'Fit view', exact: true }).click(); const handle = page.getByRole('button', { name: 'Resize selected design' }); await handle.focus(); const width = await layer.evaluate(node => parseFloat(node.style.width)); await page.keyboard.press('ArrowRight'); expect(await layer.evaluate(node => parseFloat(node.style.width))).toBeGreaterThan(width);
  await page.getByRole('button', { name: 'Reset design', exact: true }).click(); const dialog = page.getByRole('dialog', { name: 'Reset your engraving design?' }); await expect(dialog).toBeVisible();
  for (let index = 0; index < 5; index++) { await page.keyboard.press(index % 2 ? 'Shift+Tab' : 'Tab'); expect(await dialog.evaluate(node => node.contains(document.activeElement))).toBe(true); }
  await dialog.getByRole('button', { name: 'Reset design', exact: true }).click(); await expect(layer).toHaveCount(0); await page.getByRole('button', { name: 'Undo', exact: true }).click(); await expect(layer).toHaveCount(1);
  await shot(page, info, 'touch-text', 390); await page.reload(); await expect(page.locator('.sv-surface-preview .ve-surface')).toHaveCount(0); expect(JSON.stringify(await page.evaluate(() => ({ ...localStorage, ...sessionStorage })))).not.toContain('For Nour');
});

test('an expired add reference requires explicit replacement and never silently renews its file', async ({ page, context }) => {
  const surface = await start(page); await words(page, 'For Nour'); await review(page);
  let expiredId; const signs = []; page.on('request', request => { if (request.url().endsWith('/uploads/sign')) signs.push(request.postDataJSON()); });
  await page.route('**/commerce/cart/items', async route => {
    if (route.request().method() !== 'POST') return route.continue();
    const id = route.request().postDataJSON().specification.surfacePhotoUploadId; expiredId ||= id;
    if (id !== expiredId) return route.continue();
    return route.fulfill({ status: 409, json: { ok: false, error: { code: 'INVALID_UPLOAD_REFERENCES', message: 'This private surface photo has expired. Replace it.' } }, headers: { 'access-control-allow-origin': origin, 'access-control-allow-credentials': 'true' } });
  });
  await page.getByRole('button', { name: 'Add to Cart', exact: true }).click(); await expect(page.getByRole('alert').filter({ hasText: 'expired' }).first()).toBeVisible();
  await page.getByRole('button', { name: 'Edit Design', exact: true }).click(); await review(page); await page.getByRole('button', { name: 'Add to Cart', exact: true }).click();
  await expect(page.getByRole('alert').filter({ hasText: 'expired' }).first()).toBeVisible(); expect(signs).toHaveLength(1);
  await page.locator('.tw-builder-progress button').first().click(); await choose(page, /Engraving surface: Replace surface photo/, surface); await page.getByRole('button', { name: 'Design Your Engraving', exact: true }).click(); await add(page);
  expect(signs).toHaveLength(2); expect((await cart(context)).items).toHaveLength(1);
});
