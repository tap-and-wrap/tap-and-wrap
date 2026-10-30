import { expect, test } from '@playwright/test';
import { giftBoxFixture, beginGiftBox } from './gift-box-fixtures.js';

// Phase 6B.4a captures synthetic, isolated evidence; no real customer data.
// This is NOT a release sign-off or a substitute for owner packing approval.
const fakePng = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+zCCkAAAAASUVORK5CYII=', 'base64');
const noCommerceMutations = calls => calls.filter(call =>
  /\/cart\b|\/orders\b|\/checkout\b|\/submit\b|\/upload\b|\/convert\b/i.test(call.path));
async function noHorizontalOverflow(page) {
  const measure = await page.evaluate(() => ({ viewport: innerWidth, documentWidth: document.documentElement.scrollWidth }));
  expect(measure.documentWidth, JSON.stringify(measure)).toBeLessThanOrEqual(measure.viewport + 1);
}
async function capture(page, info, label) {
  await page.evaluate(() => { document.activeElement?.blur(); window.scrollTo({top: 0, left: 0, behavior: 'instant'}); });
  await page.screenshot({ path: info.outputPath(label), fullPage: true });
}

test.beforeEach(async ({ page }) => {
  const pageErrors = [];
  page.on('pageerror', error => pageErrors.push(error.message));
  page.__phase6b4Errors = pageErrors;
  const unexpectedMutations = [];
  page.on('request', request => {
    const endpoint = new URL(request.url()).pathname;
    if (!['GET', 'HEAD', 'OPTIONS'].includes(request.method())
      && /\/api\/v1\/(?:cart(?:\/|$)|orders(?:\/|$)|checkout(?:\/|$)|uploads?(?:\/|$)|gift-box\/(?:submit|convert)(?:\/|$))/i.test(endpoint)) {
      unexpectedMutations.push({ method: request.method(), endpoint });
    }
  });
  page.__phase6b4UnexpectedMutations = unexpectedMutations;
});
test.afterEach(async ({ page }) => {
  expect(page.__phase6b4Errors).toEqual([]);
  expect(page.__phase6b4UnexpectedMutations).toEqual([]);
});

for (const width of [320, 390, 768, 1440]) {
  test(`Phase 6B.4a complete six-step study at ${width}px has no pricing leakage or overflow`, async ({ page }, info) => {
    test.setTimeout(90_000); // screenshots and font/layout evidence can be slow on Windows CI
    await page.setViewportSize({ width, height: 950 });
    const f = await giftBoxFixture(page);
    await beginGiftBox(page); // selects the valid fixture box-2
    await expect(page.locator('.gb-steps button')).toHaveCount(6);
    await noHorizontalOverflow(page);
    await page.locator('.gb-steps button').nth(1).click();
    await page.getByRole('button', { name: 'Add Fixture rose-red', exact: true }).click();
    await page.locator('.gb-steps button').nth(2).click();
    await page.getByRole('button', { name: 'Add Fixture plush-1', exact: true }).click();
    await page.locator('.gb-steps button').nth(3).click();
    await page.getByRole('button', { name: 'Add Fixture chocolate-1', exact: true }).click();
    await expect(page.locator('.gb-placed')).toHaveCount(3);
    await expect(page.locator('.gb-price-summary strong')).toContainText('40.00');
    const pricedBeforePersonal = f.estimates.length;
    await page.locator('.gb-steps button').nth(4).click();
    await expect(page.getByRole('heading', { name: 'Make It Personal' })).toBeVisible();
    await page.getByLabel('Add special photos').setInputFiles(
      Array.from({ length: 3 }, (_, index) => ({ name: `phase6b4-photo-${index + 1}.png`, mimeType: 'image/png', buffer: fakePng })));
    await expect(page.locator('.gb-photo-on-box')).toHaveCount(3);
    await page.getByLabel('Engraving 1 (optional)').fill('١٢ / ١٠ / ٢٠٢٦ 💛');
    await page.getByRole('button', { name: '+ Add another engraving' }).click();
    await page.getByLabel('Engraving 2 (optional)').fill('Forever yours');
    await page.getByRole('group', { name: 'Engraving 2 colors' }).getByRole('button', { name: 'Gold', exact: true }).click();
    await page.getByRole('button', { name: '+ Add another engraving' }).click();
    await page.getByLabel('Engraving 3 (optional)').fill('An unforgettable day');
    await expect(page.locator('.gb-engraving-paper')).toHaveCount(3);
    expect(f.estimates.length).toBe(pricedBeforePersonal);
    await noHorizontalOverflow(page);
    await capture(page, info, `phase6b4-personal-${width}.png`);
    await page.locator('.gb-steps button').nth(5).click();
    await page.getByRole('button', { name: 'Choose Fixture ribbon-cream-ivory', exact: true }).click();
    await page.getByLabel('Add a gift card').check();
    await page.getByLabel('Your personal message').fill('Your day is special 🎁');
    await expect(page.locator('.gb-price-summary strong')).toContainText('60.00');
    await page.getByRole('button', { name: 'Next: Review' }).click();
    await expect(page.getByRole('heading', { name: 'Review your gift' })).toBeVisible();
    await expect(page.getByText('3 selected photo(s); 3 engraving(s). Not uploaded or priced.')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Request submission unavailable' })).toBeDisabled();
    await expect(page.locator('.gb-review')).toContainText('١٢ / ١٠ / ٢٠٢٦ 💛');
    expect(noCommerceMutations(f.calls)).toEqual([]);
    await noHorizontalOverflow(page);
    await capture(page, info, `phase6b4-review-${width}.png`);
  });
}

test('Phase 6B.4a double-width text preserves the personal step and closed submission', async ({ page }, info) => {
  test.setTimeout(90_000);
  await page.setViewportSize({ width: 320, height: 900 });
  const f = await giftBoxFixture(page);
  await beginGiftBox(page);
  await page.locator('.gb-steps button').nth(4).click();
  await page.getByLabel('Engraving 1 (optional)').fill('ذكرى ٢٠٢٦');
  await page.getByRole('group', { name: 'Engraving 1 colors' }).getByRole('button', { name: 'Yellow' }).click();
  await page.evaluate(() => { document.documentElement.style.fontSize = '200%'; });
  await noHorizontalOverflow(page);
  await capture(page, info, 'phase6b4-text-200percent-320.png');
  await page.locator('.gb-steps button').nth(5).click();
  await noHorizontalOverflow(page);
  await page.getByRole('button', { name: 'Next: Review' }).click();
  await expect(page.getByRole('button', { name: 'Request submission unavailable' })).toBeDisabled();
  expect(noCommerceMutations(f.calls)).toEqual([]);
});

test('Phase 6B.4a Box 11 study does not silently approve physical fit', async ({ page }, info) => {
  test.setTimeout(90_000);
  await page.setViewportSize({ width: 390, height: 844 });
  const f = await giftBoxFixture(page);
  await beginGiftBox(page);
  await page.locator('.gb-steps button').first().click();
  await page.getByRole('button', { name: 'Choose Fixture box-11', exact: true }).click();
  await expect(page.locator('.gb-preview-caption')).toContainText('not guaranteed fit');
  await page.locator('.gb-steps button').nth(3).click();
  await page.getByRole('button', { name: 'Add Fixture chocolate-1', exact: true }).click();
  await expect(page.locator('.gb-placed')).toHaveCount(1);
  await noHorizontalOverflow(page);
  await capture(page, info, 'phase6b4-box11-two-level-390.png');
  await page.locator('.gb-steps button').nth(5).click();
  await page.getByRole('button', { name: 'Next: Review' }).click();
  await expect(page.getByRole('button', { name: 'Request submission unavailable' })).toBeDisabled();
  expect(noCommerceMutations(f.calls)).toEqual([]);
});
