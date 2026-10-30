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


for (const [width, enlarged] of [[320, false], [390, false], [768, false], [1440, false], [320, true]]) {
  test(`Phase 6B.4b preview note never covers box artwork at ${width}px${enlarged ? ' with 200% text' : ''}`, async ({ page }, info) => {
    await page.setViewportSize({ width, height: 950 });
    const fixture = await giftBoxFixture(page);
    await beginGiftBox(page);
    await page.locator('.gb-steps button').nth(5).click();
    await page.getByRole('button', { name: 'Choose Fixture ribbon-cream-ivory', exact: true }).click();
    if (enlarged) await page.evaluate(() => { document.documentElement.style.fontSize = '200%'; });
    const note = page.locator('.gb-preview-caption');
    await expect(note).toHaveText('Photo-derived layout study · approximate scale, not guaranteed fit');
    const bounds = await page.locator('.gb-preview-content').evaluate(root => {
      const note = root.querySelector('.gb-preview-caption');
      const canvas = root.querySelector('.gb-canvas');
      const n = note.getBoundingClientRect();
      const c = canvas.getBoundingClientRect();
      return { separateSibling: note.parentElement === root,
        gap: n.top - c.bottom, noteLeft: n.left, noteRight: n.right,
        canvasLeft: c.left, canvasRight: c.right };
    });
    expect(bounds.separateSibling).toBe(true);
    expect(bounds.gap).toBeGreaterThanOrEqual(5);
    expect(bounds.noteLeft).toBeGreaterThanOrEqual(bounds.canvasLeft - 1);
    expect(bounds.noteRight).toBeLessThanOrEqual(bounds.canvasRight + 1);
    await noHorizontalOverflow(page);
    await page.screenshot({ path: info.outputPath(`phase6b4b-caption-${width}${enlarged ? '-text200' : ''}.png`), fullPage: true });
    expect(noCommerceMutations(fixture.calls)).toEqual([]);
  });
}


// Phase 6B.4b.2: one open engraving at a time, even after edits/removals.
for (const [width, enlarged] of [[320, false], [390, false], [1440, false], [320, true]]) {
  test(`Phase 6B.4b.2 engraving accordions retain independent drafts at ${width}px${enlarged ? ' enlarged' : ''}`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    const f = await giftBoxFixture(page);
    await beginGiftBox(page);
    await page.locator('.gb-steps button').nth(4).click();
    if (enlarged) await page.evaluate(() => { document.documentElement.style.fontSize = '200%'; });
    const before = f.estimates.length;
    await expect(page.getByRole('button', { name: 'Edit engraving 1' })).toHaveAttribute('aria-expanded', 'true');
    await page.getByLabel('Engraving 1 (optional)').fill('١٢ / ١٠ / ٢٠٢٦ 💛');
    await page.getByRole('group', { name: 'Engraving 1 colors' }).getByRole('button', { name: 'White' }).click();
    await page.getByRole('group', { name: 'Engraving 1 lettering styles' }).getByRole('button', { name: 'Style 12' }).click();
    await page.getByRole('button', { name: '+ Add another engraving' }).click();
    await expect(page.getByRole('button', { name: 'Edit engraving 1' })).toHaveAttribute('aria-expanded', 'false');
    await expect(page.getByRole('button', { name: 'Edit engraving 2' })).toHaveAttribute('aria-expanded', 'true');
    await expect(page.locator('.gb-engraving-fields').first()).toBeHidden();
    await page.getByLabel('Engraving 2 (optional)').fill('A second memory');
    await page.getByRole('button', { name: '+ Add another engraving' }).click();
    await page.getByLabel('Engraving 3 (optional)').fill('Third entry 🎁');
    await page.getByRole('group', { name: 'Engraving 3 colors' }).getByRole('button', { name: 'Gold' }).click();
    await expect(page.locator('.gb-engraving-fields:not([hidden])')).toHaveCount(1);
    await expect(page.locator('.gb-engraving-toggle')).toHaveCount(3);
    await page.getByRole('button', { name: 'Edit engraving 1' }).click();
    await expect(page.getByLabel('Engraving 1 (optional)')).toHaveValue('١٢ / ١٠ / ٢٠٢٦ 💛');
    await expect(page.getByRole('group', { name: 'Engraving 1 colors' }).getByRole('button', { name: 'White' })).toHaveAttribute('aria-pressed', 'true');
    await expect(page.getByRole('group', { name: 'Engraving 1 lettering styles' }).getByRole('button', { name: 'Style 12' })).toHaveAttribute('aria-pressed', 'true');
    await page.getByRole('button', { name: 'Remove engraving 2' }).click();
    await page.getByRole('button', { name: 'Edit engraving 2' }).click();
    await expect(page.getByLabel('Engraving 2 (optional)')).toHaveValue('Third entry 🎁');
    await expect(page.getByRole('group', { name: 'Engraving 2 colors' }).getByRole('button', { name: 'Gold' })).toHaveAttribute('aria-pressed', 'true');
    await noHorizontalOverflow(page);
    expect(f.estimates).toHaveLength(before);
    await page.locator('.gb-steps button').nth(5).click();
    await expect(page.locator('.gb-engraving-paper')).toHaveCount(2);
    await expect(page.getByRole('button', { name: 'Next: Review' })).toBeEnabled();
    await page.getByRole('button', { name: 'Next: Review' }).click();
    await expect(page.getByRole('button', { name: 'Request submission unavailable' })).toBeDisabled();
    expect(noCommerceMutations(f.calls)).toEqual([]);
  });
}

// Phase 6B.4b.3 — real browser-generated sample image; never touches R2 or checkout.
for (const [width, enlarged] of [[320, false], [390, false], [768, false], [1440, false], [320, true]]) {
  test(`Phase 6B.4b.3 photo inspection and final review remain separate at ${width}px${enlarged ? ' with enlarged text' : ''}`, async ({ page }, info) => {
    test.setTimeout(90_000);
    await page.setViewportSize({ width, height: 900 });
    const f = await giftBoxFixture(page);
    await beginGiftBox(page);
    await expect(page.locator('.gb-price-summary strong')).toContainText('10.00');
    const sample = await page.evaluate(() => {
      const image = document.createElement('canvas');
      image.width = 240; image.height = 180;
      const ctx = image.getContext('2d');
      ctx.fillStyle='#9ecae1'; ctx.fillRect(0,0,240,180);
      ctx.fillStyle='#426b47'; ctx.fillRect(0,110,240,70);
      ctx.fillStyle='#c84f55'; ctx.fillRect(64,50,110,75);
      ctx.fillStyle='#f1d785'; ctx.beginPath(); ctx.arc(190,35,20,0,2*Math.PI); ctx.fill();
      return image.toDataURL('image/png').split(',')[1];
    });
    await page.locator('.gb-steps button').nth(4).click();
    const estimateRequests = f.estimates.length;
    await page.getByLabel('Add special photos').setInputFiles({name:'contrast-sample.png',mimeType:'image/png',buffer:Buffer.from(sample,'base64')});
    await expect(page.locator('.gb-photo-on-box')).toHaveCount(1);
    const footprintBefore = await page.locator('.gb-photo-on-box').getAttribute('style');
    await page.getByRole('button', { name: 'Position photo print 1' }).click();
    const preview = page.getByRole('img', { name: 'Larger local preview of photo 1' });
    await expect(preview).toBeVisible();
    await expect(page.getByRole('group', {name: 'Selected photo preview'})).toContainText('does not represent actual print dimensions');
    const size = await preview.boundingBox();
    expect(size.width).toBeGreaterThanOrEqual(110);
    expect(await page.locator('.gb-photo-on-box').getAttribute('style')).toBe(footprintBefore);
    if (enlarged) await page.evaluate(() => { document.documentElement.style.fontSize='200%'; });
    await noHorizontalOverflow(page);
    await capture(page,info,`phase6b4b3-photo-inspection-${width}${enlarged ? '-text200' : ''}.png`);
    expect(f.estimates).toHaveLength(estimateRequests);
    await page.locator('.gb-steps button').nth(5).click();
    await page.getByRole('button', { name: 'Choose Fixture ribbon-cream-ivory', exact: true }).click();
    await expect(page.locator('.gb-price-summary strong')).toContainText('20.00');
    await page.getByRole('button', { name: 'Next: Review' }).click();
    const review = page.locator('.gb-review');
    await expect(review.getByRole('group', {name:'Component estimate'})).toContainText('20.00');
    await expect(review.getByRole('group', {name:'Component estimate'})).toContainText('not included');
    await expect(review.getByRole('region', {name:'Local personalization drafts'})).toContainText('1 selected photo(s); 0 engraving(s). Not uploaded or priced.');
    await expect(page.getByRole('button', { name: 'Request submission unavailable' })).toBeDisabled();
    await noHorizontalOverflow(page);
    await capture(page,info,`phase6b4b3-final-review-${width}${enlarged ? '-text200' : ''}.png`);
    expect(noCommerceMutations(f.calls)).toEqual([]);
  });
}
