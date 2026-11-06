import { ownerFixture } from './owner-dashboard-fixtures.js';
import { chooseOption, expectOptions } from './select-option.js';
import { test, expect } from '@playwright/test';
import { mockCommerce, commerceOrder, commerceProduct, commerceTemplate } from './commerce-fixtures.js';
import { mockCatalog, adminProduct } from './catalog-fixtures.js';

const adminFixture = ownerFixture;

test('secondary anchor and button variants retain readable computed contrast, including hover and disabled states', async ({ page }) => {
  await adminFixture(page);
  await page.goto('/admin/orders');
  const anchor = page.getByRole('link', { name: 'Quotation history', exact: true });
  const info = async locator => locator.evaluate(element => {
    const style = getComputedStyle(element);
    const rgb = color => color.match(/[\d.]+/g).slice(0, 3).map(Number).map(value => { value /= 255; return value <= .04045 ? value / 12.92 : ((value + .055) / 1.055) ** 2.4; });
    const luminance = color => rgb(color).reduce((total, value, index) => total + value * [.2126, .7152, .0722][index], 0);
    const foreground = luminance(style.color), background = luminance(style.backgroundColor);
    return { contrast: (Math.max(foreground, background) + .05) / (Math.min(foreground, background) + .05), height: element.getBoundingClientRect().height, color: style.color, background: style.backgroundColor };
  });
  expect((await info(anchor)).contrast).toBeGreaterThanOrEqual(4.5);
  await anchor.hover();
  expect((await info(anchor)).contrast).toBeGreaterThanOrEqual(4.5);
  const button = page.locator('.admin-content').getByRole('button', { name: 'Previous', exact: true });
  await expect(button).toBeDisabled();
  expect((await info(button)).contrast).toBeGreaterThanOrEqual(4.5);
  expect((await info(button)).height).toBeGreaterThanOrEqual(44);
});







for (const field of ['categoryIds', 'categoryIds.0']) {
  test(`category-restriction validation associates ${field} with one accessible boundary and preserves IDs`, async ({ page }) => {
    const discount = { _id: '710000000000000000000080', revision: 0, code: 'ISOLATED10', name: 'Isolated restricted discount', active: false, kind: 'fixed', value: 1000, minimumSubtotalPiastres: 0, maximumDiscountPiastres: null, productIds: [], categoryIds: [commerceProduct.category._id], authenticatedOnly: false, stackWithBundles: false, startsAt: null, endsAt: null, usageLimit: null, perCustomerLimit: null };
    await adminFixture(page, { discount });
    const submitted = [];
    await page.route(`**/api/v1/admin/commerce/discounts/${discount._id}`, route => {
      if (route.request().method() !== 'PATCH') return route.fallback();
      submitted.push(route.request().postDataJSON());
      return route.fulfill({ status: 400, json: { ok: false, error: { code: 'VALIDATION_ERROR', message: 'Please check the discount.', details: [{ field, message: 'Review the configured category restriction.' }] } }, headers: { 'access-control-allow-origin': 'http://127.0.0.1:5191', 'access-control-allow-credentials': 'true' } });
    });
    await page.goto('/admin/commerce/discounts');
    await page.getByRole('button', { name: `Edit ${discount.name}`, exact: true }).click();
    const indexed = page.getByRole('group', { name: 'Category restriction 1', exact: true });
    const main = indexed.getByRole('combobox', { name: 'Eligible main category', exact: true });
    await chooseOption(main, commerceProduct.category._id);
    const child = indexed.getByRole('combobox', { name: 'Narrow to subcategory (optional)', exact: true });
    await expect(child).toBeVisible();
    await page.getByRole('button', { name: 'Save discount', exact: true }).click();
    const boundary = field === 'categoryIds' ? page.getByRole('group', { name: 'Eligible Categories (optional)', exact: true }) : indexed;
    await expect(boundary).toHaveAttribute('aria-invalid', 'true');
    await expect(boundary).toBeFocused();
    await expect(main).not.toHaveAttribute('aria-invalid', 'true');
    await expect(child).not.toHaveAttribute('aria-invalid', 'true');
    expect(await main.getAttribute('data-name')).not.toBe(await child.getAttribute('data-name'));
    await expect(main).toHaveAttribute('data-selected-value', commerceProduct.category._id);
    await expect(child).toHaveAttribute('data-selected-value', commerceProduct.category._id);
    await expect(page.getByRole('alert')).toHaveCount(1);
    const description = await boundary.getAttribute('aria-describedby');
    await expect(page.locator(`[id="${description}"]`)).toContainText('configured category restriction');
    expect(submitted).toHaveLength(1);
    expect(submitted[0]).toMatchObject({ expectedRevision: 0, categoryIds: [commerceProduct.category._id] });
  });
}

test('removing an earlier category restriction preserves the next parent and clears the removed child search', async ({ page }) => {
  const first = { ...commerceProduct.category, name: 'First isolated root', slug: 'first-isolated-root' };
  const second = { ...first, _id: '710000000000000000000090', name: 'Second isolated root', slug: 'second-isolated-root' };
  const firstChild = { ...first, _id: '710000000000000000000091', name: 'Only first child', slug: 'only-first-child', parentId: first._id };
  const secondChild = { ...second, _id: '710000000000000000000092', name: 'Only second child', slug: 'only-second-child', parentId: second._id };
  const discount = { _id: '710000000000000000000080', revision: 0, code: 'ISOLATED10', name: 'Isolated two-root discount', active: false, kind: 'fixed', value: 1000, minimumSubtotalPiastres: 0, maximumDiscountPiastres: null, productIds: [], categoryIds: [first._id, second._id], authenticatedOnly: false, stackWithBundles: false, startsAt: null, endsAt: null, usageLimit: null, perCustomerLimit: null };
  const fixture = await adminFixture(page, { discount });
  const categoryRequests = [];
  await page.route('**/api/v1/admin/categories**', route => {
    const params = new URL(route.request().url()).searchParams;
    const parent = params.get('parent'), search = params.get('search') || '';
    categoryRequests.push({ parent, search });
    const categories = (parent === 'root' ? [first, second] : parent === first.slug ? [firstChild] : parent === second.slug ? [secondChild] : []).filter(category => category.name.toLowerCase().includes(search.toLowerCase()));
    return route.fulfill({ json: { ok: true, data: { categories, pagination: { page: 1, limit: 20, total: categories.length, pages: 1 } } }, headers: { 'access-control-allow-origin': 'http://127.0.0.1:5191', 'access-control-allow-credentials': 'true' } });
  });
  await page.goto('/admin/commerce/discounts');
  await page.getByRole('button', { name: `Edit ${discount.name}`, exact: true }).click();
  const firstRow = page.getByRole('group', { name: 'Category restriction 1', exact: true });
  const secondRow = page.getByRole('group', { name: 'Category restriction 2', exact: true });
  await firstRow.getByRole('combobox', { name: 'Eligible main category', exact: true }).click();
  await expect(page.getByRole('option', { name: first.name, exact: true })).toHaveCount(1);
  await page.keyboard.press('Escape');
  await chooseOption(firstRow.getByRole('combobox', { name: 'Eligible main category', exact: true }), first._id);
  await chooseOption(secondRow.getByRole('combobox', { name: 'Eligible main category', exact: true }), second._id);
  const firstChildSelect = firstRow.getByRole('combobox', { name: 'Narrow to subcategory (optional)', exact: true });
  const childSearch = firstRow.getByRole('textbox', { name: 'Find narrow to subcategory (optional)', exact: true });
  await childSearch.fill(firstChild.name);
  await childSearch.locator('..').locator('..').getByRole('button', { name: 'Find categories', exact: true }).click();
  await expect.poll(() => categoryRequests.some(request => request.parent === first.slug && request.search === firstChild.name)).toBe(true);
  await secondRow.getByRole('combobox', { name: 'Narrow to subcategory (optional)', exact: true }).click();
  await expect(page.getByRole('option', { name: secondChild.name, exact: true })).toHaveCount(1);
  await page.keyboard.press('Escape');
  await firstRow.getByRole('button', { name: 'Remove category restriction', exact: true }).click();
  await expect(secondRow).toHaveCount(0);
  const remaining = page.getByRole('group', { name: 'Category restriction 1', exact: true });
  await expect(remaining.getByRole('textbox', { name: 'Find narrow to subcategory (optional)', exact: true })).toHaveValue('');
  const child = remaining.getByRole('combobox', { name: 'Narrow to subcategory (optional)', exact: true });
  await child.click();
  await expect(page.getByRole('option', { name: secondChild.name, exact: true })).toHaveCount(1);
  await expect(page.getByRole('option', { name: firstChild.name, exact: true })).toHaveCount(0);
  await page.keyboard.press('Escape');
  await chooseOption(child, secondChild._id);
  await page.getByRole('button', { name: 'Save discount', exact: true }).click();
  await expect(page.getByText('Discount saved.', { exact: true })).toBeVisible();
  expect(fixture.calls.filter(call => call.method === 'PATCH').at(-1).body).toMatchObject({ expectedRevision: 0, categoryIds: [secondChild._id] });
});

test('category edits refresh cached homepage category selections through the actual featured query family', async ({ page }) => {
  const product = { ...commerceProduct, category: { ...commerceProduct.category, featured: true, revision: 0 } };
  const fixture = await adminFixture(page, { product });
  await page.route(`**/api/v1/admin/categories/${product.category._id}`, async route => {
    if (route.request().method() !== 'PATCH') return route.fallback();
    const { expectedRevision, ...payload } = route.request().postDataJSON();
    expect(expectedRevision).toBe(fixture.product.category.revision);
    Object.assign(fixture.product.category, payload, { revision: expectedRevision + 1 });
    return route.fulfill({ json: { ok: true, data: { category: fixture.product.category } }, headers: { 'access-control-allow-origin': 'http://127.0.0.1:5191', 'access-control-allow-credentials': 'true' } });
  });
  await page.goto('/');
  await expect(page.getByRole('heading', { name: product.category.name, exact: true })).toBeVisible();
  const before = fixture.calls.filter(call => call.path === '/categories').length;
  await page.locator('header a[aria-label="Account"][href="/admin"]').click();
  await page.getByRole('navigation', { name: 'Administration', exact: true }).getByRole('link', { name: 'Categories', exact: true }).click();
  await page.locator('.admin-products-table').getByRole('button', { name: 'Edit', exact: true }).click();
  await page.getByLabel('Name', { exact: true }).fill('Revised isolated featured category');
  await page.getByRole('button', { name: 'Save category', exact: true }).click();
  await expect(page.getByRole('cell', { name: /Revised isolated featured category/ })).toBeVisible();
  await page.getByRole('link', { name: /^Home.*storefront$/, exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Revised isolated featured category', exact: true })).toBeVisible();
  expect(fixture.calls.filter(call => call.path === '/categories').length).toBeGreaterThan(before);
});

test('order management exposes authorized contact details and excludes invalid COD/payment choices', async ({ page }) => {
  const fixture = await adminFixture(page, { order: { ...commerceOrder, customer: { ...commerceOrder.customer, notes: 'Isolated delivery note' } } });
  await page.goto(`/admin/commerce/orders/${commerceOrder.id}`);
  const contact = page.getByRole('region', { name: 'Customer and delivery details' });
  await expect(contact.getByRole('link', { name: commerceOrder.customer.email })).toHaveAttribute('href', `mailto:${commerceOrder.customer.email}`);
  await expect(contact.getByRole('link', { name: commerceOrder.customer.phone })).toHaveAttribute('href', `tel:${commerceOrder.customer.phone}`);
  await expect(contact).toContainText('Isolated delivery note');
  await expect(page.getByRole('combobox', { name: 'Payment update', exact: true })).toBeDisabled();
  await expectOptions(page.getByRole('combobox', { name: 'Fulfillment update', exact: true }), ['Keep received', 'confirmed', 'cancelled']);
  await chooseOption(page.getByLabel('Fulfillment update'), 'confirmed');
  await page.getByRole('button', { name: 'Save order update' }).click();
  await expectOptions(page.getByRole('combobox', { name: 'Fulfillment update', exact: true }), ['Keep confirmed', 'preparing', 'cancelled']);
  expect(fixture.calls.filter(call => call.method === 'PATCH').at(-1).body).toMatchObject({ revision: 1, fulfillmentState: 'confirmed' });
  expect(fixture.calls.filter(call => call.path.endsWith('/proof'))).toHaveLength(0);
});

test('InstaPay status choices and private proof modal follow payment prerequisites and explicit-view lifecycle', async ({ page }) => {
  const fixture = await adminFixture(page, { order: { ...commerceOrder, paymentMethod: 'instapay', paymentState: 'awaiting_verification', proofAvailable: true } });
  await page.goto(`/admin/commerce/orders/${commerceOrder.id}`);
  await expectOptions(page.getByRole('combobox', { name: 'Fulfillment update', exact: true }), ['Keep received', 'cancelled']);
  expect(fixture.calls.filter(call => call.path.endsWith('/proof'))).toHaveLength(0);
  const proof = page.getByRole('button', { name: 'View Proof', exact: true });
  await proof.click();
  await expect(page.getByRole('dialog')).toBeVisible();
  expect(fixture.calls.filter(call => call.path.endsWith('/proof'))).toHaveLength(1);
  expect(await page.evaluate(() => document.body.style.overflow)).toBe('hidden');
  await page.keyboard.press('Escape');
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await expect(proof).toBeFocused();
  await chooseOption(page.getByRole('combobox', { name: 'Payment update', exact: true }), 'paid');
  await expectOptions(page.getByRole('combobox', { name: 'Fulfillment update', exact: true }), ['Keep received', 'confirmed']);
  await chooseOption(page.getByLabel('Fulfillment update'), 'confirmed');
  await page.getByRole('button', { name: 'Save order update' }).click();
  await expect(page.getByRole('combobox', { name: 'Payment update', exact: true })).toBeDisabled();
});

test('promotion editing uses Cairo wall time on a browser in another timezone and validates DST gaps', async ({ browser }) => {
  const context = await browser.newContext({ timezoneId: 'America/New_York' });
  const page = await context.newPage();
  try {
    const discount = { _id: '710000000000000000000060', revision: 2, name: 'Isolated scheduled discount', code: 'SCHEDULED', active: false, kind: 'fixed', value: 1000, productIds: [], categoryIds: [], minimumSubtotalPiastres: 0, startsAt: '2026-07-15T10:15:00Z', endsAt: '2026-10-29T21:30:59.123Z' };
    const fixture = await adminFixture(page, { discount });
    await page.goto('/admin/commerce/discounts');
    await page.getByRole('button', { name: `Edit ${discount.name}`, exact: true }).click();
    const start = page.getByLabel('Starts at (optional) (Cairo time)', { exact: true });
    await expect(start).toHaveValue('2026-07-15T13:15');
    // A stored second occurrence may include seconds; displaying minutes must
    // identify that occurrence without truncating or rewriting the saved instant.
    await expect(page.getByLabel('Ends at (optional) (Cairo time)', { exact: true })).toHaveValue('2026-10-29T23:30');
    await expect(page.getByRole('combobox', { name: 'Ends at (optional) clock-change occurrence', exact: true })).toHaveAttribute('data-selected-value', 'second');
    await start.fill('2026-04-24T00:30');
    await expect(start).toHaveAttribute('aria-invalid', 'true');
    await page.getByRole('button', { name: 'Save discount', exact: true }).click();
    expect(fixture.calls.filter(call => call.method === 'PATCH')).toHaveLength(0);
    await start.fill('2026-07-15T15:45');
    await page.getByRole('button', { name: 'Save discount', exact: true }).click();
    await expect(page.getByText('Discount saved.', { exact: true })).toBeVisible();
    expect(fixture.calls.filter(call => call.method === 'PATCH').at(-1).body.startsAt).toBe('2026-07-15T12:45:00.000Z');
    expect(fixture.calls.filter(call => call.method === 'PATCH').at(-1).body.endsAt).toBe('2026-10-29T21:30:59.123Z');
  } finally { await context.close(); }
});

test('admin validation associates missing native and explicit server field errors without losing merchant drafts', async ({ page }) => {
  await mockCatalog(page, { role: 'admin' });
  await page.goto(`/admin/products/${adminProduct._id}/edit`);
  const name = page.getByLabel('Product name', { exact: true });
  await name.fill('');
  await page.getByRole('button', { name: 'Save changes', exact: true }).click();
  await expect(name).toHaveAttribute('aria-invalid', 'true');
  await expect(name).toBeFocused();
  const description = await name.getAttribute('aria-describedby');
  await expect(page.locator(`[id="${description}"]`)).toContainText('fill');
  await name.fill('Unsaved meaningful product name');
  await expect(name).not.toHaveAttribute('aria-invalid', 'true');
  const price = page.getByLabel('Price (EGP)', { exact: false }).first();
  await price.fill('12.345');
  await page.getByRole('button', { name: 'Save changes', exact: true }).click();
  await expect(price).toHaveAttribute('aria-invalid', 'true');
  await expect(price).toBeFocused();
  await expect(name).toHaveValue('Unsaved meaningful product name');
  await expect(price).toHaveValue('12.345');
});

test('saving a product refreshes an already-cached public detail and preserves safe public session caching', async ({ page }) => {
  const product = { ...commerceProduct, revision: 0, status: 'ready', categoryId: commerceProduct.category._id, subcategoryId: null, galleryKeys: ['Fixtures/approved.webp'], mainImageKey: 'Fixtures/approved.webp', reviewRequired: false };
  const fixture = await adminFixture(page, { product });
  await page.route(`**/api/v1/admin/products/${product._id}`, async route => {
    if (route.request().method() !== 'PATCH') return route.fallback();
    const { expectedRevision, ...payload } = route.request().postDataJSON();
    expect(expectedRevision).toBe(fixture.product.revision);
    Object.assign(fixture.product, payload, { revision: expectedRevision + 1 });
    return route.fulfill({ json: { ok: true, data: { product: fixture.product } }, headers: { 'access-control-allow-origin': 'http://127.0.0.1:5191', 'access-control-allow-credentials': 'true' } });
  });
  await page.goto(`/products/${product.slug}`);
  await expect(page.getByRole('heading', { name: product.name, exact: true })).toBeVisible();
  const requestsBefore = fixture.calls.filter(call => call.path === `/products/${product.slug}`).length;
  // Client-side links preserve the same QueryClient. Full page.goto would hide
  // this regression by destroying every cache on each navigation.
  await page.locator('header a[aria-label="Account"][href="/admin"]').click();
  await page.getByRole('navigation', { name: 'Administration', exact: true }).getByRole('link', { name: 'Products', exact: true }).click();
  await page.getByRole('link', { name: new RegExp(`Edit ${product.name}`) }).first().click();
  await page.getByLabel('Product name', { exact: true }).fill('Revised isolated public detail');
  await page.getByRole('button', { name: 'Save changes', exact: true }).click();
  await expect(page.getByText('Changes saved.', { exact: true })).toBeVisible();
  await page.getByRole('link', { name: /^Home.*storefront$/, exact: true }).click();
  // The real public navigation points to Shop; the fixture serves only this product.
  await page.getByRole('navigation', { name: 'Main navigation', exact: true }).getByRole('link', { name: 'Shop', exact: true }).click();
  await page.getByRole('link', { name: 'Revised isolated public detail', exact: true }).first().click();
  await expect(page.getByRole('heading', { name: 'Revised isolated public detail', exact: true, level: 1 })).toBeVisible();
  await expect.poll(() => fixture.calls.filter(call => call.path === `/products/${product.slug}`).length).toBeGreaterThan(requestsBefore);
});
