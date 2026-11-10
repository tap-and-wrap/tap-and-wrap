import { test, expect, api, origin, post, image, choose, open, start, words, review, add, cart, shot } from './visual-engraving-fixture.js';
import { seedLegacyEngraving } from './legacy-engraving-fixture.js';
test('saved missing artwork is explicit and can be replaced without changing the surface', async ({ page, context }) => {
  await start(page); const artwork = await image(page, 400, 200); await choose(page, /Engraving artwork: Add image artwork/, artwork); await add(page);
  const line = (await cart(context)).items[0], before = (await (await context.request.get(`${api}/commerce/engraving/cart/${line.id}`)).json()).data.specification;
  await page.route(`**/commerce/uploads/${before.design.layers[0].assetId}/content`, route => route.fulfill({ status: 404, json: { error: { message: 'Synthetic expired image' } } }));
  await page.goto(`/customize/laser-engraving?edit=${line.id}`); await expect(page.getByRole('alert')).toContainText('expired or are unavailable'); await page.getByRole('button', { name: 'Design Your Engraving', exact: true }).click();
  await page.getByRole('button', { name: '1. Image artwork', exact: true }).click(); await page.getByRole('button', { name: 'Remove design', exact: true }).click(); await choose(page, /Engraving artwork: Add image artwork/, artwork); await add(page);
  const after = (await (await context.request.get(`${api}/commerce/engraving/cart/${line.id}`)).json()).data.specification;
  expect(after.surfacePhotoUploadId).toBe(before.surfacePhotoUploadId); expect(after.design.layers[0].assetId).not.toBe(before.design.layers[0].assetId); expect((await cart(context)).items).toHaveLength(1);
});

test('historical Drawing remains on the v1 edit path and is never silently converted', async ({ page, context }) => {
  const id = await seedLegacyEngraving(context, { mode: 'personal', subtype: 'drawing' }); await page.goto(`/customize/laser-engraving?edit=${id}`);
  await expect(page.getByRole('heading', { name: 'Choose your item', exact: true })).toBeVisible(); await page.getByRole('button', { name: 'Continue', exact: true }).click(); await expect(page.getByText('Your saved Drawing artwork is preserved.', { exact: false })).toBeVisible();
  await expect(page.locator('.visual-engraving')).toHaveCount(0); await page.getByRole('button', { name: 'Continue', exact: true }).click(); await page.getByRole('button', { name: 'Add Engraving to Cart', exact: true }).click(); await expect(page.getByRole('heading', { name: 'Your engraving is in the cart' })).toBeVisible();
  const spec = (await (await context.request.get(`${api}/commerce/engraving/cart/${id}`)).json()).data.specification; expect(spec.contractVersion).toBe('engraving-spec-v1'); expect(spec.content.subtype).toBe('drawing'); expect(spec.design).toBeUndefined();
});

test('owned order and admin review load composites and originals explicitly; v2 payment stays gated', async ({ page, context, browser }, info) => {
  test.setTimeout(120000); await start(page); await words(page, 'For Nour'); const artwork = await image(page, 400, 200); await choose(page, /Engraving artwork: Add image artwork/, artwork); await add(page);
  const line = (await cart(context)).items[0], spec = (await (await context.request.get(`${api}/commerce/engraving/cart/${line.id}`)).json()).data.specification;
  const checkoutKey = crypto.randomUUID(); expect((await post(context, '/commerce/checkout/quote', { checkoutKey, paymentMethod: 'instapay', governorate: 'cairo' })).ok()).toBe(true);
  const response = await post(context, '/commerce/orders', { checkoutKey, paymentMethod: 'instapay', customer: { name: 'Synthetic Stage C', email: 'stagec@example.test', phone: '01012345678', governorate: 'cairo', address: 'Disposable connected address 10' } }); expect(response.status(), await response.text()).toBe(201); const order = (await response.json()).data.order;
  let reads = 0; page.on('request', request => { if (/\/uploads\/[^/]+\/content$/.test(request.url())) reads++; });
  await page.goto(`/orders/${order.id}`); await expect(page.getByRole('heading', { name: `Order #${order.orderNumber}`, exact: true })).toBeVisible(); expect(reads).toBe(0); await expect(page.getByRole('button', { name: /Submit proof/ })).toHaveCount(0);
  await page.getByRole('button', { name: 'View saved design', exact: true }).click(); await expect(page.locator('.saved-visual-preview .ve-composite')).toBeVisible(); expect(reads).toBe(2);
  const opener = page.getByRole('button', { name: 'View artwork 1', exact: true }); await opener.click(); await expect(page.getByRole('dialog')).toBeVisible(); await page.keyboard.press('Escape'); await expect(opener).toBeFocused();
  await shot(page, info, 'owned-order', 390);
  const outsider = await browser.newContext(), adminContext = await browser.newContext({ baseURL: origin });
  try {
    expect((await outsider.request.get(`${api}/commerce/orders/${order.id}/engraving-files`)).status()).toBe(404); expect((await outsider.request.get(`${api}/commerce/uploads/${spec.surfacePhotoUploadId}/content`)).status()).toBe(404);
    expect((await post(adminContext, '/auth/login', { email: 'admin@connected.example.test', password: 'isolated-fixture-password' })).ok()).toBe(true);
    const adminPage = await adminContext.newPage(); await adminPage.goto(`/admin/orders/${order.id}`); await expect(adminPage.getByRole('heading', { name: `Order #${order.orderNumber}`, exact: true, level: 1 })).toBeVisible();
    await adminPage.getByRole('button', { name: 'View saved design', exact: true }).click(); await expect(adminPage.locator('.saved-visual-preview .ve-composite')).toBeVisible();
    const original = await adminContext.request.get(`${api}/admin/commerce/orders/${order.id}/files/${spec.design.layers[1].assetId}`); expect((await original.body()).equals(artwork.buffer)).toBe(true);
    async function action(action, extras = {}, who = adminContext) { const current = (await (await adminContext.request.get(`${api}/admin/commerce/orders/${order.id}`)).json()).data.order; return post(who, `${who === context ? '/commerce' : '/admin/commerce'}/orders/${order.id}/${who === context ? 'engraving/accept' : 'engraving-actions'}`, { revision: current.revision, operationKey: crypto.randomUUID(), itemKey: spec.itemKey, action, ...extras }); }
    expect((await action('authorize_payment')).status()).toBe(409); expect((await action('receive', { condition: 'Synthetic intact item' })).ok()).toBe(true); expect((await action('inspect')).ok()).toBe(true); expect((await action('propose', { placementId: 'front' })).ok()).toBe(true); expect((await action('accept', { proposalVersion: 1, customerConfirmed: true }, context)).ok()).toBe(true); expect((await action('authorize_payment', { collectionMethod: 'instapay' })).ok()).toBe(true);
    const final = (await (await context.request.get(`${api}/commerce/orders/${order.id}`)).json()).data.order; expect(final.paymentInstructionsByGroup.map(value => value.scope)).toEqual(['engraving']); expect(final.paymentState).toBe('unpaid');
  } finally { await outsider.close(); await adminContext.close(); }
});
