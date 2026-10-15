import { test, expect } from '@playwright/test';
import { category, subcategory, mockCatalog } from './catalog-fixtures.js';

test.beforeEach(async ({ page }) => {
  page.on('pageerror', error => { throw error; });
});

for (const width of [320, 768, 1440]) {
  test(`scoped paginated dropdown, friendly refresh and legacy replacement at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 950 });
    const fixture = await mockCatalog(page);
    const children = Array.from({ length: 23 }, (_, index) => ({ ...subcategory,
      _id: String(index + 300).padStart(24, '0'), name: `Keepsake ${index + 1}`,
      slug: `stored-keepsake-${index + 1}-abcdef01`, publicPath: `${category.publicPath}/keepsake-${index + 1}`,
    }));
    const calls = [];
    await page.route('**/api/v1/public/categories**', async route => {
      const url = new URL(route.request().url());
      const path = url.pathname.replace('/api/v1', '');
      let data;
      if (path === '/public/categories') {
        calls.push(Object.fromEntries(url.searchParams));
        const pageNumber = Number(url.searchParams.get('page') || 1);
        data = { categories: children.slice((pageNumber - 1) * 20, pageNumber * 20), pagination: { page: pageNumber, limit: 20, total: 23, pages: 2 } };
      } else {
        const selected = children.find(item => path.replace('/children/', '/') === `/public${item.publicPath}` || path === `/public/categories/${item.slug}`);
        data = { category: selected ? { ...selected, parent: category } : { ...category, parent: null } };
      }
      await route.fulfill({ json: { ok: true, data } });
    });
    await page.goto(`${category.publicPath}?q=Fixture&sort=newest`);
    const chooser = page.getByRole('combobox', { name: 'Browse Fixture Gifts' });
    await expect(chooser).toBeEnabled();
    await expect(chooser.locator('option')).toHaveCount(24);
    if (width !== 768) await page.screenshot({ path: `test-results/category-chooser-${width}.png`, fullPage: true });
    expect(calls).toEqual([1, 2].map(pageNumber => ({ parent: category.slug, page: String(pageNumber), limit: '20', includeProductCounts: 'false' })));
    await expect(page.locator('.catalog-sidebar details[open]')).toHaveCount(0);
    await expect(page.locator('.catalog-subcategories-pagination')).toHaveCount(0);
    await chooser.focus();
    await expect(chooser).toBeFocused();
    await chooser.selectOption(children[22].publicPath);
    await expect(page).toHaveURL(children[22].publicPath);
    await expect(page.locator('.catalog-card')).toHaveCount(20);
    await expect(page.locator('.catalog-subcategories')).toHaveCount(0);
    await page.reload();
    await expect(page.getByRole('heading', { name: 'Keepsake 23 Gifts' })).toBeVisible();
    await expect(page.locator('.catalog-sidebar details[open]')).toHaveCount(0);
    expect(fixture.requests.filter(item => item.path === '/public/products').at(-1).params).toMatchObject({ category: category.slug, subcategory: children[22].slug });
    await page.goto(`/categories/${children[22].slug}?q=Fixture&sort=newest&page=2&availability=sold_out&minPrice=100`);
    await expect(page).toHaveURL(`${children[22].publicPath}?q=Fixture&sort=newest&page=2&availability=sold_out&minPrice=100`);
    await expect(page.getByRole('heading', { name: 'Keepsake 23 Gifts' })).toBeVisible();
    await page.goBack();
    await expect(page).not.toHaveURL(new RegExp(children[22].slug));
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  });
}

test('subcategory loading, failure retry and empty states leave root products usable', async ({ page }) => {
  await mockCatalog(page);
  let state = 'loading';
  let release;
  const pending = new Promise(resolve => { release = resolve; });
  await page.route('**/api/v1/public/categories?**', async route => {
    if (state === 'loading') await pending;
    if (state === 'error') return route.fulfill({ status: 503, json: { ok: false } });
    return route.fulfill({ json: { ok: true, data: { categories: [], pagination: { page: 1, pages: 0, total: 0, limit: 20 } } } });
  });
  await page.goto(category.publicPath);
  try {
    await expect(page.getByText('Loading subcategories…')).toBeVisible();
    await expect(page.locator('.catalog-card')).toHaveCount(20);
  } finally { state = 'error'; release(); }
  await expect(page.getByText('Subcategories could not be loaded.')).toBeVisible();
  state = 'empty';
  await page.getByRole('button', { name: 'Retry subcategories' }).click();
  await expect(page.getByText('No subcategories in this category.')).toBeVisible();
  await expect(page.getByRole('combobox', { name: 'Browse Fixture Gifts' })).toBeDisabled();
  await expect(page.locator('.catalog-card')).toHaveCount(20);
});
