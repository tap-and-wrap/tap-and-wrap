import { test, expect } from '@playwright/test';
import { adminProduct, detail, mockCatalog } from './catalog-fixtures.js';

const browserErrors = new WeakMap();
test.beforeEach(async ({ page }) => {
  const errors = [];
  browserErrors.set(page, errors);
  page.on('pageerror', (error) => errors.push(error.message));
});
test.afterEach(async ({ page }) => {
  expect(browserErrors.get(page), 'Uncaught browser errors').toEqual([]);
});

test('shop requests twenty products and keeps server filters, counts, sorting and pagination in the URL', async ({ page }) => {
  const fixture = await mockCatalog(page);
  await page.goto('/shop?page=2');
  await expect(page.locator('.catalog-card')).toHaveCount(20);
  await expect(page.getByText('Page 2 of 3')).toBeVisible();
  expect(fixture.requests.find((item) => item.path === '/public/products').params).toMatchObject({ page: '2', limit: '20' });
  await page.getByRole('button', { name: 'Next page', exact: true }).click();
  await expect(page.locator('.catalog-card')).toHaveCount(1);
  await page.getByRole('combobox', { name: 'Sort by', exact: true }).selectOption('price_desc');
  await expect(page).toHaveURL(/sort=price_desc/);
  await expect(page.locator('.catalog-card').first()).toContainText('Fixture Gift 41');
  const filters = page.locator('.catalog-sidebar');
  await expect(filters.getByRole('slider')).toHaveCount(0);
  await expect(filters.locator('summary')).toHaveText(['Category', 'Availability', 'Price']);
  await filters.getByRole('combobox', { name: 'Category', exact: true }).selectOption('fixture-gifts');
  await expect(filters.getByRole('combobox', { name: 'Subcategory', exact: true })).toHaveCount(0);
  await filters.getByLabel('Availability').selectOption('available');
  await filters.getByLabel('Minimum price (EGP)').fill('12.00');
  await filters.getByLabel('Maximum price (EGP)').fill('15.00');
  await filters.getByRole('button', { name: 'Apply filters' }).click();
  await expect(page.locator('.catalog-results-toolbar')).toContainText('3 products');
  expect(fixture.requests.filter((item) => item.path === '/public/products').at(-1).params).toMatchObject({ category: 'fixture-gifts', availability: 'available', minPrice: '1200', maxPrice: '1500', limit: '20', sort: 'price_desc', page: '1', includePriceRange: 'false' });
  expect(fixture.requests.filter((item) => item.path === '/public/products').at(-1).params).not.toHaveProperty('subcategory');
  await page.getByLabel('Search products by name').fill('Fixture Gift 05');
  await page.getByRole('search').getByRole('button', { name: 'Search', exact: true }).click();
  await expect(page.locator('.catalog-results-toolbar')).toContainText('1 product');
  await expect(page).toHaveURL(/q=Fixture\+Gift\+05/);
});

test('mobile drawers contain focus, support Escape and apply and clear filters', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await mockCatalog(page);
  await page.goto('/shop');
  await expect(page.locator('.catalog-card')).toHaveCount(20);
  const trigger = page.getByRole('button', { name: 'Filters', exact: true });
  await trigger.click();
  const dialog = page.getByRole('dialog', { name: 'Filters', exact: true });
  await expect(dialog).toBeVisible();
  for (let index = 0; index < 14; index++) await page.keyboard.press('Tab');
  expect(await dialog.evaluate((element) => element.contains(document.activeElement))).toBe(true);
  for (let index = 0; index < 14; index++) await page.keyboard.press('Shift+Tab');
  expect(await dialog.evaluate((element) => element.contains(document.activeElement))).toBe(true);
  await page.keyboard.press('Escape');
  await expect(dialog).toHaveCount(0);
  await expect(trigger).toBeFocused();
  await trigger.click();
  await dialog.getByLabel('Availability').selectOption('sold_out');
  await dialog.getByRole('button', { name: 'View Results' }).click();
  await expect(page.locator('.catalog-results-toolbar')).toContainText('1 product');
  await trigger.click();
  await dialog.getByRole('button', { name: 'Clear All' }).click();
  await dialog.getByRole('button', { name: 'View Results' }).click();
  await expect(page).not.toHaveURL(/availability=/);
  await page.getByRole('button', { name: 'Sort', exact: true }).click();
  await page.getByRole('dialog', { name: 'Sort by' }).getByRole('button', { name: 'Name Z–A' }).click();
  await expect(page).toHaveURL(/sort=name_desc/);
});

test('shop layout has two mobile and four wide columns without page overflow', async ({ page }) => {
  await mockCatalog(page);
  await page.goto('/shop');
  await expect(page.locator('.catalog-card')).toHaveCount(20);
  for (const width of [320, 390, 768, 1440]) {
    await page.setViewportSize({ width, height: 1000 });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
    const columns = await page.locator('.catalog-results .catalog-grid').evaluate((element) => getComputedStyle(element).gridTemplateColumns.split(' ').length);
    if (width <= 390) expect(columns).toBe(2);
    if (width === 1440) expect(columns).toBe(4);
  }
  await page.screenshot({ path: 'test-results/shop-desktop.png', fullPage: true });
});

test('shop handles loading, service errors, retries and empty results', async ({ page }) => {
  let failing = true;
  await mockCatalog(page, { listError: () => failing });
  await page.goto('/shop');
  await expect(page.getByRole('heading', { name: 'We couldn’t load the shop' })).toBeVisible();
  failing = false;
  await page.getByRole('button', { name: 'Try again', exact: true }).click();
  await expect(page.locator('.catalog-card')).toHaveCount(20);
  await page.getByLabel('Search products by name').fill('No matching fixture');
  await page.getByRole('search').getByRole('button', { name: 'Search', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'No products found' })).toBeVisible();
  await expect(page.locator('.catalog-results-toolbar')).toContainText('0 products');
});

test('product gallery, required options, stock and sticky controls preserve server-approved cart behavior', async ({ page }) => {
  const fixture = await mockCatalog(page);
  await page.goto('/products/fixture-gift-2');
  await expect(page.getByRole('heading', { name: detail.name, exact: true })).toBeVisible();
  await expect(page.locator('.product-sticky-bar')).toHaveCount(0);
  await expect(page.locator('.product-main-image img')).toHaveAttribute('src', detail.mainImageUrl);
  await page.getByRole('button', { name: 'View image 2' }).click();
  await expect(page.locator('.product-main-image img')).toHaveAttribute('src', detail.galleryUrls[1]);
  await expect(page.getByLabel('Gift name *')).toHaveAttribute('required', '');
  await expect(page.locator('input[type=file]')).toHaveCount(1);
  await expect(page.getByRole('link', { name: 'Customize This' })).toHaveCount(0);
  await page.getByLabel('Choose size / color').selectOption('small-rose');
  await expect(page.locator('.product-price')).toContainText('12.34');
  await page.getByRole('button', { name: 'Increase quantity' }).click();
  await expect(page.getByLabel('Quantity', { exact: true })).toHaveValue('2');
  await page.getByLabel('Quantity', { exact: true }).fill('20');
  await expect(page.getByLabel('Quantity', { exact: true })).toHaveValue('3');
  await page.getByLabel('Choose size / color').selectOption('large-rose');
  await expect(page.locator('.product-stock-status')).toHaveText('Sold Out');
  await page.getByLabel('Choose size / color').selectOption('small-rose');
  await expect(page.getByRole('button', { name: 'Add to Cart', exact: true })).toBeEnabled();
  await expect(page.locator('.product-related .catalog-card')).toHaveCount(4);
  await page.locator('.product-related').evaluate((element) => element.scrollIntoView({ block: 'start' }));
  await expect.poll(() => page.locator('.product-purchase-section').evaluate((element) => element.getBoundingClientRect().bottom)).toBeLessThan(0);
  await expect(page.locator('.product-sticky-bar')).toBeVisible();
  await page.locator('.product-sticky-bar').getByRole('button', { name: 'Choose Options' }).click();
  await expect(page.getByLabel('Choose size / color')).toBeFocused();
  expect(fixture.requests.some((item) => ['POST', 'PATCH', 'DELETE'].includes(item.method) && /cart|checkout|payment/.test(item.path))).toBe(false);
});

test('customize eligibility is independent of personalization and hidden drafts return not found', async ({ page }) => {
  await mockCatalog(page, { product: { ...detail, personalization: { fields: [] }, customization: { enabled: true, templateId: 'fixture-template', serviceKind: 'laser_engraving', serviceEntryEligible: false } } });
  await page.goto('/products/fixture-gift-2');
  await expect(page.getByRole('link', { name: 'Customize This' })).toHaveAttribute('href', '/products/fixture-gift-2/customize');
  await page.goto('/products/unapproved');
  await expect(page.getByRole('heading', { name: 'Product not found' })).toBeVisible();
  await expect(page.locator('.product-price')).toHaveCount(0);
});

test('admin pages do not mount product queries for signed-out or customer accounts', async ({ page }) => {
  const fixture = await mockCatalog(page);
  await page.goto('/admin/products');
  await expect(page.getByRole('heading', { name: 'Administrator sign in' })).toBeVisible();
  expect(fixture.requests.some((item) => item.path.startsWith('/admin/products'))).toBe(false);
  await page.unroute('**/api/v1/**');
  const customer = await mockCatalog(page, { role: 'customer' });
  await page.reload();
  await expect(page.getByRole('heading', { name: 'Access denied' })).toBeVisible();
  expect(customer.requests.some((item) => item.path.startsWith('/admin/'))).toBe(false);
});

test('admin requires protected server verification and paginates its product table', async ({ page }) => {
  const fixture = await mockCatalog(page, { role: 'admin' });
  await page.goto('/admin/products');
  await expect(page.locator('tbody tr')).toHaveCount(20);
  await page.getByRole('button', { name: 'Next page', exact: true }).click();
  await expect(page.getByText('Page 2 of 3')).toBeVisible();
  expect(fixture.requests.filter((item) => item.path === '/admin/products').at(-1).params).toMatchObject({ page: '2', limit: '20' });
  await page.getByRole('combobox', { name: 'Publication', exact: true }).selectOption('draft');
  await page.getByRole('combobox', { name: 'Sort products', exact: true }).selectOption('name_desc');
  await expect(page).toHaveURL(/status=draft/);
  await expect.poll(() => fixture.requests.filter((item) => item.path === '/admin/products').at(-1).params.sort).toBe('name_desc');
  expect(fixture.requests.filter((item) => item.path === '/admin/products').at(-1).params).toMatchObject({ page: '1', status: 'draft', sort: 'name_desc' });
});

test('admin edits invalidate approval and preserve untouched configuration and main image ordering', async ({ page }) => {
  const fixture = await mockCatalog(page, { role: 'admin' });
  await page.goto(`/admin/products/${adminProduct._id}/edit`);
  await expect(page.getByLabel('Product name', { exact: true })).toHaveValue(adminProduct.name);
  await page.getByRole('textbox', { name: /^Price \(EGP\)/ }).fill('12.34');
  await expect(page.getByLabel('Approve product price', { exact: true })).not.toBeChecked();
  await page.getByLabel('No Inventory Tracking / Made by Request', { exact: true }).check();
  await expect(page.getByLabel('Approve product inventory', { exact: true })).not.toBeChecked();
  await page.getByRole('button', { name: 'Set image 2 as main' }).click();
  await page.getByRole('button', { name: 'Save changes', exact: true }).click();
  await expect(page.getByText('Changes saved.', { exact: true })).toBeVisible();
  expect(fixture.saves).toHaveLength(1);
  const { payload, csrf } = fixture.saves[0];
  expect(csrf).toBe('isolated-fixture-token');
  expect(payload.pricePiastres).toBe(1234);
  expect(payload.priceApproved).toBe(false);
  expect(payload.inventory).toMatchObject({ mode: 'made_to_order', quantity: null, approved: false });
  expect(payload.mainImageKey).toBe(adminProduct.galleryKeys[1]);
  for (const key of ['personalization', 'customization', 'externalCatalogId', 'catalogRole']) expect(payload).not.toHaveProperty(key);
});

test('admin add form defaults to ten provisional units and shows server validation feedback', async ({ page }) => {
  await mockCatalog(page, { role: 'admin', saveError: true });
  await page.goto('/admin/products/new');
  await expect(page.getByLabel('Product quantity', { exact: true })).toHaveValue('10');
  await expect(page.getByLabel('Approve product inventory', { exact: true })).not.toBeChecked();
  await page.getByLabel('Product name', { exact: true }).fill('Fixture New Product');
  await page.getByRole('combobox', { name: 'Main category', exact: true }).selectOption('111111111111111111111111');
  await page.getByRole('button', { name: 'Save product', exact: true }).click();
  await expect(page.getByRole('alert')).toContainText('Approve price before publication.');
});

test('homepage requests featured categories and at most eight explicitly selected eligible best sellers', async ({ page }) => {
  const fixture = await mockCatalog(page);
  await page.goto('/');
  await expect(page.locator('.home-product-grid .catalog-card')).toHaveCount(8);
  expect(fixture.requests.find((item) => item.path === '/public/products').params).toMatchObject({ bestSeller: 'true', sort: 'best_sellers', availability: 'available', limit: '8' });
  expect(fixture.requests.find((item) => item.path === '/public/categories').params).toMatchObject({ parent: 'root', featured: 'true', limit: '20' });
});

test('shop presents loading while the catalog response is pending', async ({ page }) => {
  let release;
  const pending = new Promise((resolve) => { release = resolve; });
  await mockCatalog(page, { beforeList: () => pending });
  await page.goto('/shop');
  await expect(page.locator('.catalog-results-toolbar')).toContainText('Loading products…');
  await expect(page.locator('.catalog-skeleton')).toHaveCount(8);
  release();
  await expect(page.locator('.catalog-card')).toHaveCount(20);
});

test('server-denied administrator verification blocks the editor even with an admin role response', async ({ page }) => {
  const fixture = await mockCatalog(page, { role: 'admin', denyAdmin: true });
  await page.goto('/admin/products/new');
  await expect(page.getByRole('heading', { name: 'Access denied' })).toBeVisible();
  await expect(page.getByLabel('Product name', { exact: true })).toHaveCount(0);
  expect(fixture.requests.some((item) => item.path.startsWith('/admin/products'))).toBe(false);
});

test('product and admin editor layouts remain contained on mobile and tablet', async ({ page }) => {
  await mockCatalog(page, { role: 'admin' });
  for (const path of ['/products/fixture-gift-2', `/admin/products/${adminProduct._id}/edit`]) {
    await page.goto(path);
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
    for (const width of [320, 390, 768]) {
      await page.setViewportSize({ width, height: 844 });
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
    }
    await page.setViewportSize({ width: 390, height: 844 });
    await page.screenshot({ path: path.startsWith('/admin') ? 'test-results/admin-mobile.png' : 'test-results/product-mobile.png', fullPage: true });
  }
});
