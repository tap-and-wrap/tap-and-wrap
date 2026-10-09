import { test, expect } from '@playwright/test';
import { category, subcategory, mockCatalog } from './catalog-fixtures.js';
import { catalogPriceErrors } from '../src/utils/catalog.js';

const priceMinimum = (filters) => filters.getByLabel('Minimum price (EGP)', { exact: true });
const priceMaximum = (filters) => filters.getByLabel('Maximum price (EGP)', { exact: true });
const productRequests = (fixture) => fixture.requests.filter((request) => request.path === '/public/products');

test.beforeEach(async ({ page }) => {
  // All service traffic is intercepted by the fixture. External fonts are unnecessary.
  await page.route('https://fonts.googleapis.com/**', (route) => route.abort());
  await page.route('https://fonts.gstatic.com/**', (route) => route.abort());
});

test('three keyboard accordion groups preserve drafts and never request subcategory lists or slider bounds', async ({ page }) => {
  const fixture = await mockCatalog(page);
  await page.goto('/shop');
  await expect(page.locator('.catalog-card')).toHaveCount(20);
  const filters = page.locator('.catalog-sidebar');
  await expect(filters.locator('summary')).toHaveText(['Category', 'Availability', 'Price']);
  await expect(filters.locator('input[type=range]')).toHaveCount(0);
  await expect(filters.getByRole('combobox', { name: 'Subcategory', exact: true })).toHaveCount(0);
  await priceMinimum(filters).fill('12.');
  const price = filters.locator('summary').filter({ hasText: /^Price$/ });
  await price.focus();
  await page.keyboard.press('Enter');
  await expect(priceMinimum(filters)).toBeHidden();
  await page.keyboard.press('Space');
  await expect(priceMinimum(filters)).toHaveValue('12.');
  await filters.getByLabel('Category', { exact: true }).selectOption(category.slug);
  expect(fixture.requests.filter((request) => request.path === '/public/categories').every((request) => request.params.parent === 'root')).toBe(true);
  expect(productRequests(fixture)).toHaveLength(1);
  expect(productRequests(fixture)[0].params).toMatchObject({ limit: '20', includePriceRange: 'false' });
  await filters.getByRole('button', { name: 'Apply filters' }).click();
  await expect(page).toHaveURL(/minPrice=1200/);
  await expect(priceMinimum(filters)).toHaveValue('12');
});

test('price drafts retain natural typing, reject invalid values and convert only validated EGP', async ({ page }) => {
  const fixture = await mockCatalog(page);
  await page.goto('/shop?q=Fixture&sort=name_desc');
  await expect(page.locator('.catalog-card')).toHaveCount(20);
  const filters = page.locator('.catalog-sidebar');
  const initialCount = productRequests(fixture).length;
  for (const amount of ['-1', '12.345', '1e2', 'not money', '90071992547409.92']) {
    await priceMinimum(filters).fill(amount);
    await filters.getByRole('button', { name: 'Apply filters' }).click();
    await expect(priceMinimum(filters)).toHaveAttribute('aria-invalid', 'true');
    await expect(priceMinimum(filters)).toHaveValue(amount);
    await expect(filters.getByRole('alert')).toContainText('Enter a non-negative EGP');
    expect(productRequests(fixture)).toHaveLength(initialCount);
    expect(await priceMinimum(filters).evaluate((element) => element.getAttribute('aria-describedby').split(' ').some((id) => document.getElementById(id)?.textContent.includes('non-negative')))).toBe(true);
  }
  await priceMinimum(filters).fill('0');
  await priceMaximum(filters).fill('12.34');
  await filters.getByRole('button', { name: 'Apply filters' }).click();
  await expect(page).toHaveURL(/minPrice=0&maxPrice=1234/);
  expect(productRequests(fixture).at(-1).params).toMatchObject({ minPrice: '0', maxPrice: '1234', q: 'Fixture', sort: 'name_desc', limit: '20' });
  await priceMinimum(filters).fill('   ');
  await priceMaximum(filters).fill('');
  await filters.getByRole('button', { name: 'Apply filters' }).click();
  await expect(page).not.toHaveURL(/minPrice|maxPrice/);
});

test('reversed price errors open their accordion and focus associated inputs without submitting', async ({ page }) => {
  const fixture = await mockCatalog(page);
  await page.goto('/shop');
  await expect(page.locator('.catalog-card')).toHaveCount(20);
  const filters = page.locator('.catalog-sidebar');
  await priceMinimum(filters).fill('30');
  await priceMaximum(filters).fill('20');
  await filters.locator('summary').filter({ hasText: /^Price$/ }).click();
  await filters.getByRole('button', { name: 'Apply filters' }).click();
  await expect(priceMinimum(filters)).toBeFocused();
  await expect(priceMinimum(filters)).toHaveAttribute('aria-invalid', 'true');
  await expect(priceMaximum(filters)).toHaveAttribute('aria-invalid', 'true');
  await expect(filters.getByRole('alert')).toContainText('Minimum price must be less');
  expect(productRequests(fixture)).toHaveLength(1);
});

test('Clear All is consistent in mobile and empty states and preserves search/sort', async ({ page }) => {
  const fixture = await mockCatalog(page);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/shop?q=Fixture&sort=price_desc&availability=sold_out&minPrice=999999&page=2');
  await expect(page.getByRole('heading', { name: 'No products found' })).toBeVisible();
  await page.getByRole('button', { name: 'Filters', exact: true }).click();
  const drawer = page.getByRole('dialog', { name: 'Filters', exact: true });
  await expect(drawer.locator('summary')).toHaveText(['Category', 'Availability', 'Price']);
  await drawer.getByRole('button', { name: 'Clear All' }).click();
  await expect(page).toHaveURL('/shop?q=Fixture&sort=price_desc');
  await expect(priceMinimum(drawer)).toHaveValue('');
  await drawer.getByRole('button', { name: 'View Results' }).click();
  await expect(drawer).toHaveCount(0);
  await expect(page.locator('.catalog-results-toolbar')).toContainText('41 products');
  expect(productRequests(fixture).at(-1).params).toMatchObject({ q: 'Fixture', sort: 'price_desc', page: '1', limit: '20' });
  await page.goto('/shop?q=Missing&sort=name_asc&minPrice=999999');
  await expect(page.getByRole('heading', { name: 'No products found' })).toBeVisible();
  await page.locator('.catalog-state').getByRole('button', { name: 'Clear All' }).click();
  await expect(page).toHaveURL('/shop?q=Missing&sort=name_asc');
});

test('browser history restores applied prices while discarded drafts never reach the API', async ({ page }) => {
  const fixture = await mockCatalog(page);
  await page.goto('/shop');
  await expect(page.locator('.catalog-card')).toHaveCount(20);
  const filters = page.locator('.catalog-sidebar');
  await priceMinimum(filters).fill('12.34');
  await filters.getByRole('button', { name: 'Apply filters' }).click();
  await expect(page).toHaveURL(/minPrice=1234/);
  await priceMinimum(filters).fill('99.');
  await page.goBack();
  await expect(page).toHaveURL('/shop');
  await expect(priceMinimum(filters)).toHaveValue('');
  await page.goForward();
  await expect(priceMinimum(filters)).toHaveValue('12.34');
  expect(productRequests(fixture).some((request) => request.params.minPrice === '9900')).toBe(false);
});

test('legacy subcategory URLs are represented by a visible category and never remain hidden', async ({ page }) => {
  const fixture = await mockCatalog(page);
  await page.goto(`/shop?category=${category.slug}&subcategory=${subcategory.slug}&q=Fixture&sort=newest`);
  await expect(page).toHaveURL(`/shop?category=${subcategory.slug}&q=Fixture&sort=newest`);
  const select = page.locator('.catalog-sidebar').getByLabel('Category', { exact: true });
  await expect(select).toHaveValue(subcategory.slug);
  await expect(select.locator('option:checked')).toHaveText(subcategory.name);
  await expect(page.locator('.catalog-card')).toHaveCount(20);
  expect(productRequests(fixture).every((request) => request.params.category === subcategory.slug && !request.params.subcategory)).toBe(true);
});

test('main category routes discard hidden legacy subcategory filters while preserving canonical child pages', async ({ page }) => {
  const fixture = await mockCatalog(page);
  await page.goto(`/categories/${category.slug}?subcategory=${subcategory.slug}&q=Fixture&sort=newest`);
  await expect(page).toHaveURL(`/categories/${category.slug}?q=Fixture&sort=newest`);
  const select = page.locator('.catalog-sidebar').getByLabel('Category', { exact: true });
  await expect(select).toBeDisabled();
  await expect(select).toHaveValue(category.slug);
  await expect(page.locator('.catalog-card')).toHaveCount(20);
  expect(productRequests(fixture).every((request) => request.params.category === category.slug && !request.params.subcategory)).toBe(true);
  await page.goto(`/categories/${subcategory.slug}?subcategory=obsolete-hidden-refinement&q=Fixture`);
  await expect(page).toHaveURL(`/categories/${subcategory.slug}?q=Fixture`);
  await expect(select).toHaveValue(subcategory.slug);
  await expect(page.locator('.catalog-sidebar').getByText(`Within ${category.name}`, { exact: true })).toBeVisible();
  await expect(page.locator('.catalog-card')).toHaveCount(20);
  expect(productRequests(fixture).at(-1).params).toMatchObject({ category: category.slug, subcategory: subcategory.slug, limit: '20' });
});

test('invalid URL prices are explained and block requests until corrected without losing search/sort', async ({ page }) => {
  const fixture = await mockCatalog(page);
  await page.goto('/shop?q=Fixture&sort=name_asc&minPrice=-1');
  await expect(page.getByRole('heading', { name: 'Check your price filters' })).toBeVisible();
  expect(productRequests(fixture)).toHaveLength(0);
  const filters = page.locator('.catalog-sidebar');
  await expect(priceMinimum(filters)).toHaveValue('-1');
  await priceMinimum(filters).fill('1.23');
  await filters.getByRole('button', { name: 'Apply filters' }).click();
  await expect(page).toHaveURL('/shop?q=Fixture&sort=name_asc&minPrice=123');
  await expect(page.locator('.catalog-card')).toHaveCount(20);
});

test('URL monetary validation recognizes blank, zero, unsafe and reversed integer-piastre bounds', () => {
  expect(catalogPriceErrors(new URLSearchParams('minPrice=&maxPrice=0'))).toEqual({});
  for (const value of ['-1', '1.5', '1e2', 'Infinity', '9007199254740992']) {
    expect(catalogPriceErrors(new URLSearchParams({ minPrice: value }))).toHaveProperty('minPrice');
  }
  expect(catalogPriceErrors(new URLSearchParams('minPrice=200&maxPrice=100'))).toHaveProperty('range');
  expect(catalogPriceErrors(new URLSearchParams('minPrice=0&maxPrice=9007199254740991'))).toEqual({});
});

test('product-card links and buttons have visible boundaries, readable states and mobile touch targets', async ({ page }) => {
  await mockCatalog(page);
  await page.goto('/shop');
  await expect(page.locator('.catalog-card')).toHaveCount(20);
  const actions = page.locator('.catalog-card-action');
  const contrast = async (locator) => locator.evaluate((element) => {
    const style = getComputedStyle(element);
    const luminance = (color) => color.match(/[\d.]+/g).slice(0, 3).map(Number)
      .map((value) => { value /= 255; return value <= .04045 ? value / 12.92 : ((value + .055) / 1.055) ** 2.4; })
      .reduce((total, value, index) => total + value * [.2126, .7152, .0722][index], 0);
    const ratio = (a, b) => (Math.max(luminance(a), luminance(b)) + .05) / (Math.min(luminance(a), luminance(b)) + .05);
    return {
      text: ratio(style.color, style.backgroundColor),
      // Every card action sits on the same opaque white card body.
      boundary: ratio(style.borderTopColor, getComputedStyle(element.parentElement).backgroundColor === 'rgba(0, 0, 0, 0)' ? 'rgb(255, 255, 255)' : getComputedStyle(element.parentElement).backgroundColor),
      height: element.getBoundingClientRect().height, opacity: Number(style.opacity),
    };
  });
  await expect(actions.nth(0)).toHaveText('Add to Cart');
  await expect(actions.nth(1)).toHaveText('Choose Options');
  await expect(actions.nth(2)).toBeDisabled();
  for (const width of [390, 1440]) {
    await page.setViewportSize({ width, height: 1000 });
    for (const action of [actions.nth(0), actions.nth(1), actions.nth(2)]) {
      const computed = await contrast(action);
      expect(computed.text).toBeGreaterThanOrEqual(4.5);
      expect(computed.boundary).toBeGreaterThanOrEqual(3);
      expect(computed.height).toBeGreaterThanOrEqual(44);
      expect(computed.opacity).toBe(1);
    }
    await actions.nth(1).hover();
    expect((await contrast(actions.nth(1))).text).toBeGreaterThanOrEqual(4.5);
    expect((await contrast(actions.nth(1))).boundary).toBeGreaterThanOrEqual(3);
  }
});

for (const width of [320, 375, 390, 440, 768, 1024, 1440, 1920]) {
  test(`shop controls, product grids and drawers remain contained at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 1000 });
    await mockCatalog(page);
    await page.goto('/shop');
    await expect(page.locator('.catalog-card')).toHaveCount(20);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
    if (width === 320 || width === 1440) await page.screenshot({ path: `test-results/batch2-shop-${width}.png`, fullPage: true });
    if (width <= 768) {
      await page.getByRole('button', { name: 'Filters', exact: true }).click();
      const drawer = page.getByRole('dialog', { name: 'Filters', exact: true });
      await expect(drawer.locator('summary')).toHaveCount(3);
      await expect(drawer.getByRole('button', { name: 'Clear All' })).toBeVisible();
      await expect(drawer.getByRole('button', { name: 'View Results' })).toBeVisible();
      expect(await drawer.evaluate((element) => element.scrollWidth <= element.clientWidth)).toBe(true);
      await page.keyboard.press('Escape');
      await expect(page.getByRole('button', { name: 'Filters', exact: true })).toBeFocused();
    }
  });
}
