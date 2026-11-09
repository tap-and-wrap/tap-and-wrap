import { test, expect } from '@playwright/test';
import { blockExternalRequests } from './network-fixture.js';

const scope = 'guest:0:cart-fixture';
const ids = { surface: '123456789012345678901234', artwork: '123456789012345678901235' };
async function png(page, width, height) {
  return Buffer.from(await page.evaluate(({ width, height }) => {
    const canvas = document.createElement('canvas'); canvas.width = width; canvas.height = height;
    const context = canvas.getContext('2d'); context.fillStyle = '#f1e8e2'; context.fillRect(0, 0, width, height);
    context.fillStyle = '#ef2315'; context.fillRect(0, 0, width / 2, height);
    context.fillStyle = '#1264e9'; context.fillRect(width / 2, 0, width / 2, height);
    return canvas.toDataURL('image/png').split(',')[1];
  }, { width, height }), 'base64');
}
async function open(page, width = 1440) {
  await page.setViewportSize({ width, height: 1000 }); await blockExternalRequests(page);
  const errors = [], mutations = []; page.on('pageerror', error => errors.push(error.message));
  await page.route('**/api/v1/**', route => {
    const request = route.request(), path = new URL(request.url()).pathname;
    const headers = { 'Access-Control-Allow-Origin': 'http://127.0.0.1:5191', 'Access-Control-Allow-Credentials': 'true', 'Access-Control-Allow-Headers': 'content-type' };
    if (request.method() === 'OPTIONS') return route.fulfill({ status: 204, headers });
    if (request.method() !== 'GET') mutations.push(path);
    if (path.endsWith('/auth/me')) return route.fulfill({ json: { data: { user: null } }, headers });
    return route.fulfill({ status: 404, json: { error: { code: 'NOT_FOUND' } }, headers });
  });
  await page.goto('/e2e/fixtures/visual-engraving/index.html');
  await expect(page.getByRole('heading', { name: 'Your engraving, your way' })).toBeVisible();
  const surface = await png(page, 900, 600), artwork = await png(page, 400, 200);
  return { surface, artwork, errors, mutations };
}
async function upload(page, label, bytes) {
  const input = page.locator(`input[type=file][aria-label="${label}"]`);
  await input.setInputFiles({ name: 'synthetic-test.png', mimeType: 'image/png', buffer: bytes });
}
const snapshot = page => page.evaluate(() => window.snapshotEditor());
async function surfaceReady(page, bytes) { await upload(page, 'Surface photo', bytes); await expect(page.locator('.ve-surface')).toBeVisible(); }
async function addImage(page, bytes) { await upload(page, 'Image artwork', bytes); await expect(page.locator('.ve-layer img')).toBeVisible(); }

for (const width of [390, 1440]) test(`text/image placement, resizing, zoom and clean layout at ${width}px`, async ({ page }, info) => {
  const { surface, artwork, errors, mutations } = await open(page, width);
  await surfaceReady(page, surface); await page.getByRole('button', { name: 'Add text', exact: true }).click();
  await page.getByLabel('Your text', { exact: true }).fill('ذكرى جميلة');
  await expect(page.locator('.ve-layer text')).toHaveAttribute('direction', 'rtl');
  await page.getByLabel('Lettering style').selectOption('engraving-arefruqaa-v1');
  await page.getByRole('radio', { name: 'grey', exact: true }).check();
  await page.getByRole('button', { name: 'Move left', exact: true }).click();
  const before = (await snapshot(page)).design.layers[0];
  await page.getByRole('button', { name: 'Larger design', exact: true }).click();
  expect((await snapshot(page)).design.layers[0].width).toBeGreaterThan(before.width);
  await addImage(page, artwork);
  const board = await page.locator('.ve-board').boundingBox();
  await page.mouse.click(board.x + board.width * .25, board.y + board.height * .27);
  await expect.poll(async () => (await snapshot(page)).design.layers[1].x).toBeCloseTo(.25, 1);
  const target = page.locator('.ve-layer').last(), box = await target.boundingBox();
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2); await page.mouse.down(); await page.mouse.move(box.x + box.width / 2 + 30, box.y + box.height / 2 + 15, { steps: 6 }); await page.mouse.up();
  const moved = (await snapshot(page)).design.layers[1]; expect(moved.x).toBeGreaterThan(.25);
  const resize = await page.getByRole('button', { name: 'Resize selected design' }).boundingBox();
  await page.mouse.move(resize.x + 22, resize.y + 22); await page.mouse.down(); await page.mouse.move(resize.x + 40, resize.y + 22, { steps: 5 }); await page.mouse.up();
  expect((await snapshot(page)).design.layers[1].width).toBeGreaterThan(moved.width);
  const original = await snapshot(page); await page.getByRole('button', { name: 'Zoom in workspace' }).click();
  await expect(page.getByLabel('Workspace zoom')).toHaveText('125%'); expect(await snapshot(page)).toEqual(original);
  await page.getByRole('button', { name: 'Fit view', exact: true }).click();
  const image = target.locator('img'); await expect(image).toHaveCSS('filter', 'none'); await expect(image).toHaveCSS('mix-blend-mode', 'normal');
  const ratio = await image.evaluate(node => node.getBoundingClientRect().width / node.getBoundingClientRect().height); expect(ratio).toBeCloseTo(2, 3);
  const samples = await image.evaluate(async node => {
    await node.decode(); const canvas = document.createElement('canvas'); canvas.width = 400; canvas.height = 200;
    const context = canvas.getContext('2d'); context.drawImage(node, 0, 0); return [Array.from(context.getImageData(50, 50, 1, 1).data), Array.from(context.getImageData(350, 50, 1, 1).data)];
  });
  expect(samples).toEqual([[239, 35, 21, 255], [18, 100, 233, 255]]);
  await page.getByRole('button', { name: 'Send backward' }).click();
  expect((await snapshot(page)).design.layers[0].type).toBe('image');
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.evaluate(() => document.fonts.ready); await page.screenshot({ path: info.outputPath(`editor-${width}.png`), fullPage: true });
  expect(mutations).toEqual([]); expect(errors).toEqual([]);
});

test('history groups drag; undo, redo and reset preserve the surface', async ({ page }) => {
  const { surface, artwork } = await open(page); await surfaceReady(page, surface); await addImage(page, artwork);
  const original = await snapshot(page), box = await page.locator('.ve-layer').boundingBox();
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2); await page.mouse.down(); await page.mouse.move(box.x + box.width / 2 + 80, box.y + box.height / 2, { steps: 12 }); await page.mouse.up();
  const moved = await snapshot(page); await page.getByRole('button', { name: 'Undo', exact: true }).click(); expect(await snapshot(page)).toEqual(original);
  await page.getByRole('button', { name: 'Redo', exact: true }).click(); expect(await snapshot(page)).toEqual(moved);
  await page.getByRole('button', { name: 'Reset design' }).click(); expect((await snapshot(page)).design.layers).toHaveLength(0);
  expect((await snapshot(page)).design.surface).toEqual(original.design.surface);
  await page.getByRole('button', { name: 'Undo', exact: true }).click(); expect(await snapshot(page)).toEqual(moved);
});

test('native mobile touch drag and pinch zoom keep design size independent', async ({ page }) => {
  const { surface, artwork } = await open(page, 390); await surfaceReady(page, surface); await addImage(page, artwork);
  const cdp = await page.context().newCDPSession(page), box = await page.locator('.ve-board').boundingBox();
  const touch = (type, points) => cdp.send('Input.dispatchTouchEvent', { type, touchPoints: points.map((point, id) => ({ ...point, id })) });
  const center = { x: box.x + box.width / 2, y: box.y + box.height / 2 };
  await touch('touchStart', [center]); await touch('touchMove', [{ x: center.x + 25, y: center.y - 15 }]); await touch('touchEnd', []);
  const moved = await snapshot(page); expect(moved.design.layers[0].x).toBeGreaterThan(.5);
  await touch('touchStart', [{ x: center.x - 30, y: center.y }]);
  await touch('touchStart', [{ x: center.x - 30, y: center.y }, { x: center.x + 30, y: center.y }]);
  const before = await snapshot(page);
  await touch('touchMove', [{ x: center.x - 60, y: center.y }, { x: center.x + 60, y: center.y }]); await touch('touchEnd', []);
  await expect(page.getByLabel('Workspace zoom')).not.toHaveText('100%'); expect(await snapshot(page)).toEqual(before);
  await page.getByRole('button', { name: 'Fit view', exact: true }).click();
  const handle = await page.getByRole('button', { name: 'Resize selected design' }).boundingBox();
  await touch('touchStart', [{ x: handle.x + 22, y: handle.y + 22 }]); await touch('touchMove', [{ x: handle.x + 34, y: handle.y + 22 }]); await touch('touchEnd', []);
  expect((await snapshot(page)).design.layers[0].width).toBeGreaterThan(before.design.layers[0].width);
  // Beginning a pinch on empty surface must never act like a placement tap.
  const stable = await snapshot(page), current = await page.locator('.ve-board').boundingBox();
  const empty = { x: current.x + 20, y: current.y + 20 };
  await touch('touchStart', [empty]); await touch('touchStart', [empty, { x: empty.x + 35, y: empty.y }]);
  await touch('touchMove', [{ x: empty.x + 2, y: empty.y }, { x: empty.x + 65, y: empty.y }]); await touch('touchEnd', []);
  expect(await snapshot(page)).toEqual(stable);
});

test('cancelled pointer drag is discarded, surface replacement fits layers without cropping', async ({ page }) => {
  const { surface, artwork, mutations } = await open(page); await surfaceReady(page, surface); await addImage(page, artwork);
  const stable = await snapshot(page), box = await page.locator('.ve-layer').boundingBox();
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2); await page.mouse.down(); await page.mouse.move(box.x + box.width / 2 + 50, box.y + box.height / 2);
  await page.locator('.ve-board').dispatchEvent('pointercancel', { pointerId: 1 }); await page.mouse.up();
  expect(await snapshot(page)).toEqual(stable);
  const portrait = await png(page, 600, 900); await upload(page, 'Surface photo', portrait);
  await expect.poll(async () => (await snapshot(page)).design.surface.aspectRatio).toBeCloseTo(2 / 3, 4);
  expect((await snapshot(page)).design.layers).toEqual(stable.design.layers);
  expect((await snapshot(page)).design.surface.assetId).not.toEqual(stable.design.surface.assetId);
  await expect(page.locator('.ve-surface')).toHaveCSS('object-fit', 'contain');
  const invalid = Buffer.from('<svg onload="alert(1)"></svg>'); await upload(page, 'Image artwork', invalid);
  await expect(page.getByRole('alert')).toBeVisible(); expect((await snapshot(page)).design.layers).toHaveLength(1);
  expect(mutations).toEqual([]);
});

test('metadata reconstructs after refresh with explicit owned private file reads', async ({ page }) => {
  const { surface, artwork, mutations } = await open(page); await surfaceReady(page, surface); await addImage(page, artwork);
  await page.getByRole('button', { name: 'Move up', exact: true }).click(); const saved = await snapshot(page);
  expect(JSON.stringify(saved)).not.toMatch(/blob:|synthetic|\.png|storage|https:/);
  await page.reload(); await expect(page.locator('.ve-layer')).toHaveCount(0);
  const headers = { 'Access-Control-Allow-Origin': 'http://127.0.0.1:5191', 'Access-Control-Allow-Credentials': 'true' };
  for (const [role, bytes] of [['surface', surface], ['artwork', artwork]]) await page.route(`**/commerce/uploads/${ids[role]}/content`, route => route.fulfill({ body: bytes, contentType: 'image/png', headers }));
  await page.evaluate(async ({ saved, ids, scope }) => {
    const resources = {};
    resources[saved.design.surface.assetId] = await window.loadPrivateVisualAsset({ uploadId: ids.surface, ownerScope: scope });
    resources[saved.design.layers[0].assetId] = await window.loadPrivateVisualAsset({ uploadId: ids.artwork, ownerScope: scope });
    window.restoreEditor(saved, resources);
  }, { saved, ids, scope });
  await expect(page.locator('.ve-layer img')).toBeVisible(); expect(await snapshot(page)).toEqual(saved); expect(mutations).toEqual([]);
  // Missing files fail honestly; geometry is preserved and retention never extended.
  await page.evaluate(saved => window.restoreEditor(saved, {}), saved);
  await expect(page.getByText('This surface photo is unavailable. Choose or open it again.')).toBeVisible(); expect(await snapshot(page)).toEqual(saved);
});

test('owner scope, denied reads and stale private responses never leak into another session', async ({ page }) => {
  const { surface, artwork } = await open(page); await surfaceReady(page, surface); await addImage(page, artwork);
  await page.evaluate(() => window.rotateEditorOwner()); await expect(page.locator('.ve-layer')).toHaveCount(0); await expect(page.locator('.ve-surface')).toHaveCount(0);
  const denied = await page.evaluate(async () => { try { await window.loadPrivateVisualAsset({ uploadId: '123456789012345678901234', ownerScope: 'other', sessionOwnerKey: 'user:wrong:0' }); return false; } catch { return true; } }); expect(denied).toBe(true);
  let release; const pending = new Promise(resolve => { release = resolve; });
  await page.route(`**/commerce/uploads/${ids.surface}/content`, async route => { await pending; await route.fulfill({ body: surface, contentType: 'image/png', headers: { 'Access-Control-Allow-Origin': 'http://127.0.0.1:5191', 'Access-Control-Allow-Credentials': 'true' } }).catch(() => {}); });
  await page.evaluate(({ id, scope }) => { window.pendingRead = window.loadPrivateVisualAsset({ uploadId: id, ownerScope: scope }).then(() => false, () => true); }, { id: ids.surface, scope });
  await page.evaluate(() => window.changeEditorSession()); release();
  expect(await page.evaluate(() => window.pendingRead)).toBe(true);
  await expect(page.getByText('Your private session changed. Open this design again.')).toBeVisible();
});

test('approved catalog background, keyboard movement, resize, reduced motion and legacy display', async ({ page }, info) => {
  const { surface, errors } = await open(page, 390); await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.route('**/fixture-product.png', route => route.fulfill({ body: surface, contentType: 'image/png' }));
  await page.evaluate(() => window.openApprovedProduct()); await expect(page.locator('.ve-surface')).toBeVisible();
  await page.getByRole('button', { name: 'Add text', exact: true }).click(); await page.getByLabel('Your text', { exact: true }).fill('Forever');
  const target = page.getByRole('button', { name: 'Select Forever', exact: true }); await target.focus(); const before = await snapshot(page);
  await page.keyboard.press('ArrowLeft'); await page.keyboard.press('Shift+ArrowUp');
  expect((await snapshot(page)).design.layers[0].x).toBeCloseTo(before.design.layers[0].x - .01, 4);
  expect((await snapshot(page)).design.layers[0].y).toBeCloseTo(before.design.layers[0].y - .05, 4);
  await page.keyboard.press('Tab'); await expect(page.getByRole('button', { name: 'Resize selected design' })).toBeFocused();
  await page.keyboard.press('ArrowRight'); expect((await snapshot(page)).design.layers[0].width).toBeGreaterThan(before.design.layers[0].width);
  await page.keyboard.press('Shift+Tab'); await expect(target).toBeFocused();
  expect(await target.evaluate(node => getComputedStyle(node).outlineStyle)).not.toBe('none');
  await expect(page.locator('img[data-symbol]')).toHaveAttribute('src', '/assets/engraving/v1/heart.svg');
  await expect(page.getByRole('button', { name: /symbol|icon/i })).toHaveCount(0);
  expect(await page.locator('.visual-engraving').evaluate(node => node.getAnimations({ subtree: true }).length)).toBe(0);
  expect(await page.evaluate(() => ({ ...localStorage, ...sessionStorage }))).toEqual({});
  await page.screenshot({ path: info.outputPath('approved-background-keyboard-mobile.png'), fullPage: true }); expect(errors).toEqual([]);
});

test('host receives readiness changes when a font approval is withdrawn', async ({ page }) => {
  const { surface } = await open(page); await surfaceReady(page, surface);
  await page.getByRole('button', { name: 'Add text', exact: true }).click();
  await expect.poll(() => page.evaluate(() => window.visualReadiness.ready)).toBe(true);
  await page.evaluate(() => window.setApprovedEditorFonts([]));
  await expect(page.getByRole('alert')).toContainText('no longer approved');
  await expect.poll(() => page.evaluate(() => window.visualReadiness.ready)).toBe(false);
  await page.evaluate(() => window.setApprovedEditorFonts(['engraving-amiri-v1']));
  await expect.poll(() => page.evaluate(() => window.visualReadiness.ready)).toBe(true);
});

test('an unavailable approved background fails readiness without discarding saved geometry', async ({ page }) => {
  await open(page);
  await page.route('**/fixture-product.png', route => route.fulfill({ status: 404 }));
  await page.evaluate(() => window.openApprovedProduct());
  await expect(page.getByText('This surface photo is unavailable. Choose or open it again.')).toBeVisible();
  expect((await snapshot(page)).design.surface.assetId).toBe('product-image');
  expect(await page.evaluate(() => window.visualReadiness.issues)).toContain('surface_unavailable');
});
