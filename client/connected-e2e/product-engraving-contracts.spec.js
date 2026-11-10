import { test, expect, api, origin, headers, post, image, choose } from './visual-engraving-fixture.js';
async function background(page) {
  await page.goto('/'); const photo = await image(page);
  await page.route('https://catalog.connected.example.test/**', route => route.fulfill({ body: photo.buffer, contentType: 'image/png' }));
}
async function open(page) {
  await background(page); await page.goto('/products/connected-engraving-product');
  await expect(page.getByRole('heading', { name: 'Connected engraving product', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Add Engraving', exact: true }).click();
  const dialog = page.getByRole('dialog'); await expect(dialog.locator('.ve-surface').first()).toBeVisible();
  await dialog.getByRole('button', { name: 'Design your engraving', exact: true }).click(); return dialog;
}
async function words(dialog, value = 'For Nour') { await dialog.getByRole('button', { name: 'Add text', exact: true }).click(); await dialog.getByLabel('Your text', { exact: true }).fill(value); }
async function review(dialog) { await dialog.getByRole('button', { name: 'Review your engraving', exact: true }).click(); await expect(dialog.getByRole('button', { name: 'Add to Cart', exact: true })).toBeEnabled(); }
async function shot(page, dialog, info, width) { await page.setViewportSize({ width, height: 1000 }); await page.evaluate(() => document.fonts.ready); expect(await dialog.evaluate(node => node.scrollWidth <= node.clientWidth + 1)).toBe(true); await page.screenshot({ path: info.outputPath(`product-design-${width}.png`), fullPage: false }); }
async function login(context, who) { const result = await post(context, '/auth/login', { email: `${who}@connected.example.test`, password: 'isolated-fixture-password' }); expect(result.ok()).toBe(true); }

test('approved catalog background, text and original-color artwork, cart reconstruction and safe replacement', async ({ page, context }, info) => {
  test.setTimeout(120000); page.setDefaultTimeout(15000); const errors = [], signs = []; page.on('pageerror', error => errors.push(error.message)); page.on('request', request => { if (request.url().endsWith('/uploads/sign')) signs.push(request.postDataJSON()); });
  await page.emulateMedia({ reducedMotion: 'reduce' }); const dialog = await open(page); await expect(dialog.getByRole('button', { name: 'Icons', exact: true })).toHaveCount(0);
  await words(dialog, '\u0630\u0643\u0631\u0649 \u062c\u0645\u064a\u0644\u0629'); await expect(dialog.getByLabel('Lettering style')).toHaveValue('engraving-amiri-v1');
  const art = await image(page, 160, 80); await choose(page, /Engraving artwork: Add image artwork/, art); await expect(dialog.locator('.ve-layer')).toHaveCount(2);
  expect(signs).toHaveLength(0); expect(await dialog.locator('.ve-layer img').evaluate(node => getComputedStyle(node).filter)).toBe('none');
  await dialog.getByRole('button', { name: 'Undo', exact: true }).click(); await expect(dialog.locator('.ve-layer')).toHaveCount(1); await dialog.getByRole('button', { name: 'Redo', exact: true }).click(); await expect(dialog.locator('.ve-layer')).toHaveCount(2);
  const style = await dialog.locator('.ve-layer').last().getAttribute('style'); await dialog.getByRole('button', { name: 'Zoom in workspace', exact: true }).click(); expect(await dialog.locator('.ve-layer').last().getAttribute('style')).toBe(style); await dialog.getByRole('button', { name: 'Fit view', exact: true }).click();
  for (const width of [320, 390, 768, 1440]) await shot(page, dialog, info, width);
  await page.setViewportSize({ width: 390, height: 1000 });
  const board = dialog.locator('.ve-board'); await board.scrollIntoViewIfNeeded(); const area = await board.boundingBox(), cdp = await context.newCDPSession(page);
  const touch = (type, points) => cdp.send('Input.dispatchTouchEvent', { type, touchPoints: points.map((point, id) => ({ ...point, id })) });
  const point = { x: area.x + area.width * .3, y: area.y + area.height * .3 };
  await touch('touchStart', [point]); await touch('touchEnd', []); await expect.poll(() => dialog.locator('.ve-layer').last().evaluate(node => parseFloat(node.style.left))).toBeCloseTo(30, 0);
  const unchanged = await dialog.locator('.ve-layer').last().getAttribute('style'), pinch = { x: area.x + 16, y: area.y + 16 };
  await touch('touchStart', [pinch]); await touch('touchStart', [pinch, { x: pinch.x + 40, y: pinch.y }]); await touch('touchMove', [pinch, { x: pinch.x + 70, y: pinch.y }]); await touch('touchEnd', []);
  await expect(dialog.getByLabel('Workspace zoom')).not.toHaveText('100%'); expect(await dialog.locator('.ve-layer').last().getAttribute('style')).toBe(unchanged);
  await dialog.getByRole('button', { name: 'Fit view', exact: true }).click(); const handle = dialog.getByRole('button', { name: 'Resize selected design' }); await handle.focus(); const width = await dialog.locator('.ve-layer').last().evaluate(node => parseFloat(node.style.width)); await page.keyboard.press('ArrowRight'); expect(await dialog.locator('.ve-layer').last().evaluate(node => parseFloat(node.style.width))).toBeGreaterThan(width);
  await page.setViewportSize({ width: 1440, height: 1000 }); await dialog.locator('.ve-layer').last().scrollIntoViewIfNeeded(); const target = await dialog.locator('.ve-layer').last().boundingBox(); const oldLeft = await dialog.locator('.ve-layer').last().evaluate(node => parseFloat(node.style.left)); await page.mouse.move(target.x + target.width / 2, target.y + target.height / 2); await page.mouse.down(); await page.mouse.move(target.x + target.width / 2 + 20, target.y + target.height / 2 + 10); await page.mouse.up(); expect(await dialog.locator('.ve-layer').last().evaluate(node => parseFloat(node.style.left))).toBeGreaterThan(oldLeft);
  await review(dialog); await expect(dialog).toContainText(/100/); await expect(dialog).toContainText(/450/); await dialog.getByRole('button', { name: 'Add to Cart', exact: true }).click(); await expect(dialog.getByRole('heading', { name: 'Your personalized product is in the cart' })).toBeVisible();
  expect(signs).toHaveLength(1); expect(signs[0]).toMatchObject({ purpose: 'artwork', fieldKey: 'product_engraving_artwork' }); expect(signs[0].engravingItemKey).toBeUndefined();
  await dialog.getByRole('link', { name: 'View cart', exact: true }).click(); await page.getByRole('button', { name: 'View Design Details', exact: true }).click(); await page.getByRole('button', { name: 'View saved product design', exact: true }).click(); await expect(page.locator('.saved-visual-preview .ve-layer')).toHaveCount(2);
  await page.getByRole('link', { name: 'Edit engraving design', exact: true }).click(); const edit = page.getByRole('dialog'); await expect(edit.locator('.ve-surface').first()).toBeVisible(); await edit.getByRole('button', { name: 'Design your engraving', exact: true }).click(); await expect(edit.locator('.ve-layer')).toHaveCount(2);
  await edit.locator('.ve-layers button').first().click(); await edit.getByLabel('Your text', { exact: true }).fill('For Salma'); await edit.getByRole('button', { name: 'Review your engraving', exact: true }).click(); await edit.getByRole('button', { name: 'Update cart design', exact: true }).click(); await expect(edit.getByRole('heading', { name: 'Your personalized product is in the cart' })).toBeVisible();
  const cart = (await (await context.request.get(`${api}/commerce/cart`)).json()).data.cart; expect(cart.items).toHaveLength(1); expect(cart.items[0].unitPricePiastres).toBe(45000);
  const checkoutKey = crypto.randomUUID(); expect((await post(context, '/commerce/checkout/quote', { checkoutKey, paymentMethod: 'instapay', governorate: 'cairo' })).ok()).toBe(true);
  const accepted = await post(context, '/commerce/orders', { checkoutKey, paymentMethod: 'instapay', customer: { name: 'Synthetic D1', email: 'd1@example.test', phone: '01012345678', governorate: 'cairo', address: 'Disposable fixture address' } }); expect(accepted.ok()).toBe(true); const orderId = (await accepted.json()).data.order.id;
  const metadata = await context.request.get(`${api}/commerce/orders/${orderId}/product-engraving/0`); expect(metadata.ok()).toBe(true); const snapshot = (await metadata.json()).data.snapshot; expect(snapshot.specification.design.layers).toHaveLength(2); expect(snapshot.surchargePiastres).toBe(10000);
  const stranger = await page.context().browser().newContext(); await stranger.request.get(`${api}/commerce/cart`); expect((await stranger.request.get(`${api}/commerce/orders/${orderId}/product-engraving/0`)).status()).toBe(404); const artworkId = snapshot.specification.design.layers.find(layer => layer.type === 'image').assetId; expect((await stranger.request.get(`${api}/commerce/uploads/${artworkId}/content`)).status()).toBe(404); await stranger.close();
  await login(context, 'admin'); await page.goto(`/admin/orders/${orderId}`); await page.getByRole('button', { name: 'View saved product design', exact: true }).click(); await expect(page.locator('.saved-visual-preview .ve-layer')).toHaveCount(2); const download = page.waitForEvent('download'); await page.getByRole('button', { name: 'Download original artwork 1', exact: true }).click(); expect((await download).suggestedFilename()).toBe('engraving-artwork-1.png');
  expect(JSON.stringify(await page.evaluate(() => ({ ...sessionStorage, ...localStorage })))).not.toMatch(/\u0630\u0643\u0631\u0649|For Salma|blob:|synthetic-private/); expect(errors).toEqual([]);
});

test('lost response recovers one merchandise item; session change clears private draft', async ({ page, context }) => {
  const dialog = await open(page); await words(dialog); await review(dialog); let lost = false;
  await page.route('**/commerce/cart/items', async route => { if (route.request().method() === 'POST' && !lost) { lost = true; expect((await route.fetch()).ok()).toBe(true); return route.abort('connectionreset'); } return route.continue(); });
  await dialog.getByRole('button', { name: 'Add to Cart', exact: true }).click(); await expect(dialog.getByRole('button', { name: 'Check add status', exact: true })).toBeVisible(); await dialog.getByRole('button', { name: 'Check add status', exact: true }).click(); await expect(dialog.getByRole('heading', { name: 'Your personalized product is in the cart' })).toBeVisible();
  const cart = (await (await context.request.get(`${api}/commerce/cart`)).json()).data.cart; expect(cart.items).toHaveLength(1); expect(cart.items[0].kind).toBe('product');
  await login(context, 'alice'); await page.reload(); await expect(page.getByRole('dialog')).toHaveCount(0); const accountCart = (await (await context.request.get(`${api}/commerce/cart`)).json()).data.cart; expect(accountCart.items).toHaveLength(0);
});

test('expired saved artwork is explicit and replaceable without losing text or the approved background', async ({ page, context }) => {
  page.setDefaultTimeout(15000); const dialog = await open(page); await words(dialog); await choose(page, /Engraving artwork: Add image artwork/, await image(page, 160, 80)); await review(dialog); await dialog.getByRole('button', { name: 'Add to Cart', exact: true }).click(); await expect(dialog.getByRole('heading', { name: 'Your personalized product is in the cart' })).toBeVisible();
  const line = (await (await context.request.get(`${api}/commerce/cart`)).json()).data.cart.items[0];
  await page.route('**/commerce/uploads/*/content', route => route.fulfill({ status: 404, json: { ok: false, error: { code: 'UPLOAD_NOT_FOUND', message: 'Upload expired' } } }));
  await page.goto(`/products/connected-engraving-product?engravingEdit=${line.id}`); const edit = page.getByRole('dialog'); await expect(edit.getByRole('alert')).toContainText('missing or expired'); await edit.getByRole('button', { name: 'Design your engraving', exact: true }).click(); await expect(edit.locator('.ve-layer')).toHaveCount(2); await edit.locator('.ve-layers button').last().click(); await edit.getByRole('button', { name: 'Remove design', exact: true }).click(); await edit.getByRole('button', { name: 'Review your engraving', exact: true }).click(); await edit.getByRole('button', { name: 'Update cart design', exact: true }).click(); await expect(edit.getByRole('heading', { name: 'Your personalized product is in the cart' })).toBeVisible();
});

test('owner gallery configuration, surcharge CAS, stale pricing and normal purchase', async ({ page, context }) => {
  page.setDefaultTimeout(15000); await background(page); await login(context, 'admin'); await page.goto('/admin/engraving');
  const price = page.getByRole('region').filter({ hasText: 'Store-product engraving price' }); void price;
  await expect(page.getByRole('heading', { name: 'Store-product engraving price' })).toBeVisible();
  const before = (await (await context.request.get(`${api}/admin/commerce/product-engraving/price`)).json()).data;
  await page.getByLabel('Engraving price (EGP)', { exact: true }).fill('125'); await page.getByRole('button', { name: 'Save engraving price', exact: true }).click(); await expect(page.getByText('Product engraving price saved.', { exact: true })).toBeVisible();
  const stale = await context.request.patch(`${api}/admin/commerce/product-engraving/price`, { headers: await headers(context), data: { pricePiastres: 1, expectedRevision: before.revision } }); expect(stale.status()).toBe(409);
  const product = (await (await context.request.get(`${api}/public/products/connected-engraving-product`)).json()).data.product;
  await page.goto(`/admin/products/${product._id}/edit`); await expect(page.getByRole('heading', { name: 'Product engraving', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Use image 2', exact: true }).click(); await expect(page.getByRole('button', { name: 'Use image 2', exact: true })).toHaveAttribute('aria-pressed', 'true');
  await page.getByRole('button', { name: 'Preview customer editor', exact: true }).click(); await expect(page.getByRole('dialog', { name: 'Product engraving preview' }).locator('.ve-surface')).toBeVisible(); await page.getByRole('button', { name: 'Close product engraving preview', exact: true }).click();
  await page.getByRole('button', { name: 'Save changes', exact: true }).click();
  await expect.poll(async () => (await (await context.request.get(`${api}/public/products/connected-engraving-product`)).json()).data.product.productEngraving.version).toBe(2);
  await page.goto('/products/connected-engraving-product'); await page.getByRole('button', { name: 'Add to Cart', exact: true }).first().click(); await expect(page.getByText('Added to your cart.', { exact: true }).first()).toBeVisible(); const cart = (await (await context.request.get(`${api}/commerce/cart`)).json()).data.cart; expect(cart.items.at(-1).unitPricePiastres).toBe(35000); expect(cart.items.at(-1).productEngraving).toBeUndefined();
});
