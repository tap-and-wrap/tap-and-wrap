import { expect, test } from '@playwright/test';
import { giftBoxFixture, beginGiftBox } from './gift-box-fixtures.js';

test.beforeEach(async ({ page }) => {
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  page.__phase4Errors = errors;
});
test.afterEach(async ({ page }) => { expect(page.__phase4Errors).toEqual([]); });
const editor = (page, id) => page.locator('.gb-setting-editor').filter({ hasText: `${id} · ` });
const save = form => form.getByRole('button', { name: 'Save component settings', exact: true }).click();

test('all 21 solid ribbons use API names, selection, saved order and persisted Load More', async ({ page }) => {
  const fixture = await giftBoxFixture(page, { componentOverrides: { 'ribbon-peach': { displayName: 'Fixture final ribbon', pricePiastres: 2537 } } });
  await beginGiftBox(page);
  await page.locator('.gb-steps button').nth(5).click();
  await expect(page.locator('.gb-options-ribbon .gb-option')).toHaveCount(12);
  await expect(page.locator('.gb-options-ribbon img')).toHaveCount(0);
  await page.getByRole('button', { name: /Load More/ }).click();
  await expect(page.locator('.gb-options-ribbon .gb-option')).toHaveCount(21);
  const ribbon = page.getByRole('button', { name: 'Choose Fixture final ribbon', exact: true });
  await ribbon.click();
  await expect(ribbon).toHaveAttribute('aria-pressed', 'true');
  await expect(ribbon).toContainText('Selected');
  await expect(ribbon.locator('.gb-ribbon-color')).toHaveCSS('background-color', 'rgb(243, 181, 143)');
  await expect(page.locator('.gb-price-summary strong')).toContainText('35.37');
  expect(fixture.estimates.at(-1).ribbonId).toBe('ribbon-peach');
  await page.getByRole('button', { name: 'Back', exact: true }).click();
  await page.getByRole('button', { name: 'Next', exact: true }).click();
  await expect(page.locator('.gb-options-ribbon .gb-option')).toHaveCount(21);
  await expect(ribbon).toHaveAttribute('aria-pressed', 'true');
  await page.getByRole('button', { name: 'No ribbon', exact: true }).click();
  await expect(page.locator('.gb-price-summary strong')).toContainText('10.00');
  expect(fixture.media.every(path => !/ribbon|card/.test(path))).toBe(true);
});

test('selected gift card charges the API price with blank or Unicode message and stays out of checkout', async ({ page }) => {
  const fixture = await giftBoxFixture(page, { componentOverrides: { 'gift-card-1': { displayName: 'Fixture keepsake card', pricePiastres: 1875 } } });
  await beginGiftBox(page); await page.locator('.gb-steps button').nth(5).click();
  const toggle = page.getByLabel('Add a gift card'), message = page.getByLabel('Your personal message');
  await expect(toggle).not.toBeChecked(); await toggle.check();
  await expect(message).toHaveValue('');
  await expect(page.locator('.gb-price-summary strong')).toContainText('28.75');
  expect(fixture.estimates.at(-1).giftCard).toEqual({ componentId: 'gift-card-1', message: '' });
  await expect(page.locator('.gb-item-list')).toContainText('Fixture keepsake card × 1');
  await message.fill('💐'.repeat(500)); await expect(page.getByText('500 / 500 characters')).toBeVisible();
  await message.press('x'); await expect(message).toHaveValue('💐'.repeat(500));
  await expect.poll(() => fixture.estimates.at(-1)?.giftCard?.message).toBe('💐'.repeat(500));
  await toggle.uncheck(); await expect(page.locator('.gb-price-summary strong')).toContainText('10.00');
  expect(fixture.estimates.at(-1).giftCard).toBeNull();
  await toggle.check(); await expect(message).toHaveValue('💐'.repeat(500));
  await page.getByRole('button', { name: 'Next: Review' }).click();
  await expect(page.getByRole('button', { name: 'Request submission unavailable' })).toBeDisabled();
  expect(fixture.calls.every(call => !/submit|convert|order/.test(call.path))).toBe(true);
});

test('tracked stock caps both add controls; removing permits another unit and made-to-order ignores saved numeric stock', async ({ page }) => {
  const fixture = await giftBoxFixture(page, { componentOverrides: {
    'rose-red': { inventoryQuantity: 2 }, 'rose-yellow': { inventoryQuantity: 0 },
    'rose-black': { available: false }, 'plush-1': { inventoryMode: 'made_to_order', inventoryQuantity: 0 },
  } });
  await beginGiftBox(page); await page.locator('.gb-steps button').nth(1).click();
  await expect(page.getByRole('button', { name: 'Add Fixture rose-yellow', exact: true })).toBeDisabled();
  await expect(page.getByRole('button', { name: 'Add Fixture rose-yellow', exact: true })).toContainText('out of stock');
  await expect(page.getByRole('button', { name: 'Add Fixture rose-black', exact: true })).toBeDisabled();
  const rose = page.getByRole('button', { name: 'Add Fixture rose-red', exact: true });
  await rose.click(); await page.getByRole('button', { name: 'Add one Fixture rose-red', exact: true }).click();
  await expect(rose).toBeDisabled(); await expect(rose).toContainText('All available stock added');
  await expect(page.getByRole('button', { name: 'Add one Fixture rose-red', exact: true })).toBeDisabled();
  await page.getByRole('button', { name: 'Remove one Fixture rose-red', exact: true }).click();
  await expect(rose).toBeEnabled(); await rose.click();
  await page.locator('.gb-steps button').nth(2).click();
  const plush = page.getByRole('button', { name: 'Add Fixture plush-1', exact: true });
  await plush.click(); await plush.click(); await expect(plush).toBeEnabled();
  await expect(page.locator('.gb-price-summary strong')).toContainText('50.00');
  expect(fixture.estimates.every(body => body.items.every(item => item.componentId !== 'rose-red' || item.quantity <= 2))).toBe(true);
});

test('unavailable finishing settings remain visible and disabled', async ({ page }) => {
  await giftBoxFixture(page, { componentOverrides: { 'gift-card-1': { inventoryQuantity: 0 }, 'ribbon-white': { available: false } } });
  await beginGiftBox(page); await page.locator('.gb-steps button').nth(5).click();
  await expect(page.getByLabel('Add a gift card')).toBeDisabled();
  await expect(page.locator('#gb-card-policy')).toContainText('unavailable');
  await expect(page.getByRole('button', { name: 'Choose Fixture ribbon-white', exact: true })).toBeDisabled();
  await expect(page.locator('.gb-price-summary strong')).toContainText('10.00');
});

test('admin EGP drafts save exact piastres, reject invalid decimals and require explicit complimentary intent', async ({ page }) => {
  const fixture = await giftBoxFixture(page, { role: 'admin' }); await page.goto('/admin/gift-box/components');
  const form = editor(page, 'box-2'), price = form.getByLabel('Approved price (EGP)');
  await expect(price).toHaveValue('10'); await price.fill('123.45'); await save(form);
  await expect(form.getByText('Component settings saved.', { exact: true })).toBeVisible();
  expect(fixture.patches.at(-1).body.pricePiastres).toBe(12345);
  expect(fixture.patches.at(-1).body.expectedRevision).toBe(1);
  for (const invalid of ['-1', '1e3', '1.234', 'NaN']) {
    const before = fixture.patches.length; await price.fill(invalid); await save(form);
    await expect(price).toHaveAttribute('aria-invalid', 'true'); expect(fixture.patches).toHaveLength(before);
  }
  await price.fill('90071992547409.92'); await save(form);
  await expect(price).toHaveAttribute('aria-invalid', 'true'); expect(fixture.patches).toHaveLength(1);
  await price.fill('90071992547409.91'); await expect(price).toHaveValue('90071992547409.91'); await save(form);
  await expect.poll(() => fixture.patches.length).toBe(2); expect(fixture.patches.at(-1).body.pricePiastres).toBe(Number.MAX_SAFE_INTEGER);
  await price.fill('0.00'); await save(form); expect(fixture.patches).toHaveLength(2);
  await form.getByLabel('Explicitly approve this component as complimentary').check(); await save(form);
  await expect.poll(() => fixture.patches.length).toBe(3);
  expect(fixture.patches.at(-1).body).toMatchObject({ pricePiastres: 0, confirmComplimentary: true });
});

test('admin mode transitions preserve made-to-order stock and explicitly confirm returning to tracked; ribbons omit inventory writes', async ({ page }, info) => {
  const fixture = await giftBoxFixture(page, { role: 'admin', componentOverrides: { 'box-2': { inventoryQuantity: 7 } } });
  await page.goto('/admin/gift-box/components');
  const form = editor(page, 'box-2'), mode = form.getByLabel('Inventory mode');
  await mode.selectOption('made_to_order'); await expect(form.getByLabel('Stock quantity')).toHaveCount(0); await save(form);
  await expect(form.getByText('Component settings saved.', { exact: true })).toBeVisible();
  expect(fixture.patches.at(-1).body).toMatchObject({ inventoryMode: 'made_to_order', expectedRevision: 1 });
  expect(fixture.patches.at(-1).body).not.toHaveProperty('inventoryQuantity'); expect(fixture.components.find(item => item.componentId === 'box-2').inventoryQuantity).toBe(7);
  await mode.selectOption('tracked'); await form.getByLabel('Stock quantity', { exact: true }).fill('3'); await save(form); expect(fixture.patches).toHaveLength(1);
  await form.getByLabel('Confirm this tracked stock quantity').check(); await save(form);
  await expect.poll(() => fixture.patches.length).toBe(2);
  expect(fixture.patches.at(-1).body).toMatchObject({ expectedRevision: 2, inventoryMode: 'tracked', inventoryQuantity: 3, confirmInventoryQuantity: true });
  await page.getByLabel('Component category').selectOption('ribbon');
  const ribbon = editor(page, 'ribbon-cream-ivory');
  await expect(ribbon.getByLabel('Inventory mode')).toHaveCount(0); await expect(ribbon.getByLabel('Stock quantity')).toHaveCount(0);
  await ribbon.getByLabel('In stock', { exact: true }).uncheck(); await save(ribbon);
  await expect.poll(() => fixture.patches.length).toBe(3);
  const body = fixture.patches.at(-1).body; expect(body.available).toBe(false);
  for (const key of ['inventoryMode', 'inventoryQuantity', 'confirmInventoryQuantity']) expect(body).not.toHaveProperty(key);
  await page.evaluate(() => { document.activeElement?.blur(); window.scrollTo({ top: 0, behavior: 'instant' }); });
  await page.screenshot({ path: info.outputPath('admin-ribbon-availability.png'), fullPage: true });
});

test('revision conflicts preserve price, inventory and availability drafts until explicit reload', async ({ page }) => {
  await giftBoxFixture(page, { role: 'admin', conflict: true }); await page.goto('/admin/gift-box/components');
  const form = editor(page, 'box-2');
  await form.getByLabel('Approved price (EGP)').fill('22.29'); await form.getByLabel('Stock quantity').fill('8');
  await form.getByLabel('Available', { exact: true }).uncheck(); await save(form);
  await expect(form.getByText(/unsaved changes are still here/)).toBeVisible();
  await expect(form.getByLabel('Approved price (EGP)')).toHaveValue('22.29'); await expect(form.getByLabel('Stock quantity')).toHaveValue('8');
  await expect(form.getByLabel('Available', { exact: true })).not.toBeChecked();
  await form.getByRole('button', { name: 'Reload latest record', exact: true }).click();
  await form.getByRole('button', { name: 'Confirm reload and discard draft', exact: true }).click();
  await expect(form.getByLabel('Approved price (EGP)')).toHaveValue('10'); await expect(form.getByLabel('Stock quantity')).toHaveValue('100');
  await expect(form.getByLabel('Available', { exact: true })).toBeChecked();
});

for (const width of [320, 390, 768, 1440]) test(`finishing choices and inventory admin reflow at ${width}px`, async ({ page }, info) => {
  await page.setViewportSize({ width, height: 1000 }); await page.emulateMedia({ reducedMotion: 'reduce' });
  await giftBoxFixture(page, { role: 'admin' }); await beginGiftBox(page); await page.locator('.gb-steps button').nth(5).click();
  await page.getByRole('button', { name: /Load More/ }).click(); await page.getByRole('button', { name: 'Choose Fixture ribbon-peach', exact: true }).click();
  await page.getByLabel('Add a gift card').check(); await page.getByLabel('Your personal message').fill('Synthetic review message.');
  await expect(page.locator('.gb-price-summary strong')).toContainText('30.00');
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  const order = await page.evaluate(() => {
    const intro = document.querySelector('.gb-step-intro'), options = document.querySelector('.gb-options'), finishing = document.querySelector('.gb-finishing'), navigation = document.querySelector('.gb-navigation');
    return { intro: intro.getBoundingClientRect().bottom, options: options.getBoundingClientRect().top, last: options.getBoundingClientRect().bottom, finishing: finishing.getBoundingClientRect().top, finishEnd: finishing.getBoundingClientRect().bottom, nav: navigation.getBoundingClientRect().top };
  });
  expect(order.intro).toBeLessThanOrEqual(order.options); expect(order.last).toBeLessThanOrEqual(order.finishing); expect(order.finishEnd).toBeLessThanOrEqual(order.nav);
  await page.evaluate(() => { document.activeElement?.blur(); window.scrollTo({ top: 0, behavior: 'instant' }); });
  await page.screenshot({ path: info.outputPath(`finishing-${width}.png`), fullPage: true });
  if (width <= 390) {
    await page.evaluate(() => { document.documentElement.style.fontSize = '200%'; });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await page.evaluate(() => { document.documentElement.style.fontSize = ''; });
  }
  await page.goto('/admin/gift-box/components'); await expect(page.locator('.gb-setting-editor')).toHaveCount(12);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await editor(page, 'box-2').screenshot({ path: info.outputPath(`admin-inventory-${width}.png`) });
});
