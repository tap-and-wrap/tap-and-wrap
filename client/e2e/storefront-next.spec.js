import { test, expect } from '@playwright/test';
import { category, subcategory, detail, mockCatalog } from './catalog-fixtures.js';
import { ownerFeaturedReviews } from '../src/content/owner-confirmed-reviews.js';

test.use({ hasTouch: true });
test.beforeEach(async ({ page }) => { page.on('pageerror', error => { throw error; }); });

for (const width of [320, 1440]) {
  test(`search and browse remain equal and aligned at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 950 });
    const fixture = await mockCatalog(page);
    await page.goto(`${category.publicPath}?sort=newest`);
    const search = page.getByRole('search');
    const browse = page.getByRole('combobox', { name: `Browse ${category.name}` });
    await expect(browse).toBeEnabled();
    const [left, right] = await Promise.all([search.boundingBox(), browse.boundingBox()]);
    expect(Math.abs(left.y - right.y)).toBeLessThan(1);
    expect(Math.abs(left.height - right.height)).toBeLessThan(1);
    expect(Math.abs(left.width - right.width)).toBeLessThan(1);
    expect(right.x).toBeGreaterThan(left.x + left.width);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await page.screenshot({ path: `test-results/discovery-${width}.png` });
    await page.getByRole('searchbox', { name: 'Search products by name' }).fill('Fixture Gift 05');
    await search.getByRole('button', { name: 'Search', exact: true }).click();
    await expect(page).toHaveURL(`${category.publicPath}?sort=newest&q=Fixture+Gift+05`);
    await expect(page.locator('.catalog-card')).toHaveCount(1);
    expect(fixture.requests.filter(request => request.path === '/public/products').at(-1).params).toMatchObject({ category: category.slug, q: 'Fixture Gift 05', sort: 'newest' });
    await browse.selectOption(subcategory.publicPath);
    await expect(page).toHaveURL(subcategory.publicPath);
    await expect(page.locator('.catalog-discovery-paired')).toHaveCount(0);
    await page.goto('/shop');
    await expect(page.locator('.catalog-card')).toHaveCount(20);
    await expect(page.locator('.catalog-discovery-paired')).toHaveCount(0);
    await expect(page.getByRole('search')).toBeVisible();
  });

  test(`brand carousel has manual arrows, keyboard and touch navigation at ${width}px`, async ({ page, context }) => {
    await page.setViewportSize({ width, height: 950 });
    await mockCatalog(page);
    await page.goto(`/products/${detail.slug}`);
    const section = page.getByRole('region', { name: 'What Our Customers Say' });
    const track = section.locator('.customer-words-track');
    const previous = section.getByRole('button', { name: 'Previous testimonials' });
    const next = section.getByRole('button', { name: 'Next testimonials' });
    await expect(track.locator('figure')).toHaveCount(12);
    await expect(track).toHaveCSS('scrollbar-width', 'none');
    await expect(track.locator('figure').first()).toHaveCSS('min-height', '0px');
    await expect(track.locator('figcaption > span:first-child')).toHaveText(ownerFeaturedReviews.map(review => review.authorLabel));
    await expect(previous).toBeDisabled();
    await expect(next).toBeEnabled();
    await next.click();
    await expect.poll(() => track.evaluate(element => element.scrollLeft)).toBeGreaterThan(10);
    await expect(previous).toBeEnabled();
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await track.press('End');
    await expect(next).toBeDisabled();
    await track.press('Home');
    await expect(previous).toBeDisabled();
    await track.press('ArrowRight');
    await expect(previous).toBeEnabled();
    await track.press('Home');
    await expect(previous).toBeDisabled();
    if (width === 320) {
      await track.scrollIntoViewIfNeeded();
      const box = await track.boundingBox();
      const session = await context.newCDPSession(page);
      const point = { x: box.x + box.width * .8, y: box.y + box.height / 2 };
      await track.evaluate(element => { window.isolatedCarouselScrollEnd = new Promise(resolve => element.addEventListener('scrollend', resolve, { once: true })); });
      await session.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [point] });
      for (let step = 1; step <= 5; step++) await session.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ ...point, x: point.x - step * 20 }] });
      await session.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
      await expect.poll(() => track.evaluate(element => element.scrollLeft)).toBeGreaterThan(10);
      await page.evaluate(() => window.isolatedCarouselScrollEnd);
      await session.detach();
    }
    await track.press('Home');
    await expect(previous).toBeDisabled();
    await section.getByRole('heading').click();
    const [trackBox, previousBox, nextBox] = await Promise.all([track.boundingBox(), previous.boundingBox(), next.boundingBox()]);
    expect(previousBox.y).toBeGreaterThanOrEqual(trackBox.y + trackBox.height);
    expect(Math.abs(previousBox.y - nextBox.y)).toBeLessThan(1);
    expect(previousBox.x).toBeLessThan(nextBox.x);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await section.screenshot({ path: `test-results/customer-words-${width}.png` });
  });
}

test('Customize reuses the two approved film cards with links and reduced-motion posters', async ({ page }) => {
  await mockCatalog(page);
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('/customize');
  const cards = page.locator('.customize-service-grid .home-service-card');
  await expect(cards).toHaveCount(2);
  await expect(page.locator('main .service-card')).toHaveCount(0);
  await expect(cards.nth(0).getByRole('link')).toHaveAttribute('href', '/customize/gift-box');
  await expect(cards.nth(1).getByRole('link')).toHaveAttribute('href', '/customize/laser-engraving');
  for (const [index, kind] of ['gift-box', 'laser-engraving'].entries()) {
    const film = cards.nth(index).locator('video');
    await expect(film).toHaveAttribute('poster', `/media/tap-wrap-${kind}-poster.webp`);
    await expect(film).toHaveAttribute('preload', 'none');
    expect(await film.evaluate(element => element.paused)).toBe(true);
  }
  for (const width of [320, 768, 1440]) {
    await page.setViewportSize({ width, height: 950 });
    await expect(cards.nth(0).getByRole('heading', { name: 'Build Your Gift Box' })).toBeVisible();
    for (const heading of await cards.locator('h2').all()) expect(await heading.evaluate(element => element.scrollWidth <= element.clientWidth)).toBe(true);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    if (width !== 768) await page.screenshot({ path: `test-results/customize-cards-${width}.png` });
  }
});
