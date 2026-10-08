import { test, expect } from '@playwright/test';
import { mockCatalog, category, cards } from './catalog-fixtures.js';

async function websiteFixture(page, { role = 'admin' } = {}) {
  const existing = await mockCatalog(page, { role });
  const writes = [];
  const headers = { 'Access-Control-Allow-Origin': 'http://127.0.0.1:5191', 'Access-Control-Allow-Credentials': 'true', 'Access-Control-Allow-Headers': 'content-type,x-csrf-token', 'Access-Control-Allow-Methods': 'GET,POST,PATCH,OPTIONS' };
  const content = { __v: 0, about: { title: '', body: '', approved: false, updatedAt: null }, contact: { approved: false }, faq: [], faqApproved: false };
  const reviews = [];
  const customers = Array.from({ length: 23 }, (_, index) => ({ _id: String(600 + index).padStart(24, '0'), name: `Isolated Customer ${index + 1}`, email: `isolated${index}@example.test`, active: true, createdAt: '2026-10-09T12:00:00Z' }));
  await page.route('**/api/v1/admin/website/**', async (route) => {
    const request = route.request();
    if (request.method() === 'OPTIONS') return route.fulfill({ status: 204, headers });
    const url = new URL(request.url());
    const path = url.pathname.replace('/api/v1/admin/website/', '');
    const reply = (data, status = 200) => route.fulfill({ status, headers, json: status < 400 ? { ok: true, data } : { ok: false, error: data } });
    if (role !== 'admin') return reply({ message: 'Admin required' }, role ? 403 : 401);
    const pageNumber = Number(url.searchParams.get('page') || 1);
    const paginate = (values, key) => ({ [key]: values.slice((pageNumber - 1) * 20, pageNumber * 20), pagination: { page: pageNumber, limit: 20, total: values.length, pages: Math.ceil(values.length / 20) } });
    if (path === 'overview') return reply({ products: { draft: 0, ready: 0, hold: 0 }, customers: 23, pendingOrders: 0, awaitingPayment: 0, draftReviews: 0, checkoutEnabled: false, notifications: { failed: 0, dead: 0, uncertain: 0 } });
    if (path === 'customers') return reply(paginate(customers, 'customers'));
    if (path === 'notifications') return reply(paginate([{ _id: '555555555555555555555555', event: 'order_received', state: 'uncertain', attempts: 1, lastErrorCode: 'SMTP_ACCEPTANCE_UNCERTAIN', createdAt: '2026-10-09T12:00:00Z' }], 'events'));
    if (path === 'payment-settings') return reply({ checkoutEnabled: false, editable: false, launchManagedByEnvironment: true, methods: [{ key: 'cod', name: 'Cash on Delivery', verification: 'Manual collection confirmation.' }, { key: 'instapay', name: 'InstaPay', transferNumber: '01060673073', fullPaymentOnly: true, verification: 'Private proof requires manual verification.' }] });
    if (path === 'content' && request.method() === 'GET') return reply({ content });
    if (path === 'content' && request.method() === 'PATCH') { const payload = request.postDataJSON(); writes.push({ path, payload, csrf: request.headers()['x-csrf-token'] }); Object.assign(content, payload); content.__v += 1; return reply({ content }); }
    if (path === 'reviews' && request.method() === 'GET') return reply(paginate(reviews.map(({ text: _text, sourceNote: _source, ...item }) => item), 'reviews'));
    if (path === 'reviews' && request.method() === 'POST') { const payload = request.postDataJSON(); writes.push({ path, payload, csrf: request.headers()['x-csrf-token'] }); const review = { _id: '444444444444444444444444', ...payload }; reviews.push(review); return reply({ review }, 201); }
    if (path.startsWith('reviews/')) { const review = reviews.find((item) => item._id === path.split('/')[1]); if (!review) return reply({ message: 'Review not found' }, 404); if (request.method() === 'PATCH') { const payload = request.postDataJSON(); writes.push({ path, payload }); Object.assign(review, payload); } return reply({ review }); }
    return reply({ message: `Unexpected isolated website request: ${path}` }, 404);
  });
  await page.route('**/api/v1/admin/categories/**', async (route) => {
    const request = route.request();
    if (request.method() === 'OPTIONS') return route.fulfill({ status: 204, headers });
    const payload = request.postDataJSON();
    writes.push({ path: 'category', payload, csrf: request.headers()['x-csrf-token'] });
    return route.fulfill({ headers, json: { ok: true, data: { category: { ...category, ...payload } } } });
  });
  return { ...existing, writes };
}

test('admin customer lists request server pages of twenty and expose no customer mutations', async ({ page }) => {
  const fixture = await websiteFixture(page);
  const requests = [];
  page.on('request', (request) => { if (request.url().includes('/api/v1/admin/website/customers')) requests.push(new URL(request.url())); });
  await page.goto('/admin/website/customers');
  await expect(page.getByRole('heading', { level: 1, name: 'Customers' })).toBeVisible();
  await expect(page.getByRole('row')).toHaveCount(21);
  await page.getByRole('button', { name: 'Next page' }).click();
  await expect(page.getByRole('row')).toHaveCount(4);
  expect(requests.every((request) => request.searchParams.get('limit') === '20')).toBe(true);
  expect(requests.some((request) => request.searchParams.get('page') === '2')).toBe(true);
  expect(fixture.writes).toHaveLength(0);
});

test('admin review form authors real-configured content with explicit approval and supports hiding', async ({ page }) => {
  const fixture = await websiteFixture(page);
  await page.goto('/admin/website/reviews');
  await page.getByRole('button', { name: 'Add review', exact: true }).click();
  await page.getByLabel('Display author name').fill('Isolated quotation author');
  await page.getByRole('combobox', { name: /^Rating/ }).selectOption('4');
  await page.getByLabel('Review text', { exact: true }).fill('Isolated authentic-quotation workflow fixture.');
  await page.getByLabel('Private source/provenance note').fill('Isolated permission/provenance fixture.');
  await page.getByLabel('Permission to display this authentic quotation is confirmed').check();
  await page.getByLabel('Owner approval confirmed', { exact: true }).check();
  await page.locator('form.website-form').getByRole('combobox', { name: /^Publication/ }).selectOption('published');
  await page.getByLabel('Feature on homepage when published').check();
  await page.getByRole('button', { name: 'Save review', exact: true }).click();
  await expect(page.getByRole('cell', { name: 'Isolated quotation author' })).toBeVisible();
  expect(fixture.writes[0].payload).toMatchObject({ approved: true, consentConfirmed: true, featured: true, status: 'published', rating: 4 });
  expect(fixture.writes[0].csrf).toBeTruthy();
  await page.getByRole('button', { name: 'Hide', exact: true }).click();
  await expect(page.getByRole('cell', { name: 'hidden · Approved' })).toBeVisible();
  expect(fixture.writes[1].payload).toEqual({ status: 'hidden' });
});

test('content approval clears when edited and policies require explicit owner-provided text', async ({ page }) => {
  const fixture = await websiteFixture(page);
  await page.goto('/admin/website/content');
  await page.getByRole('combobox', { name: /^Section/ }).selectOption('privacyPolicy');
  await page.getByLabel('Page title', { exact: true }).fill('Isolated Privacy Policy');
  await page.getByLabel('Owner-approved page text').fill('Owner-supplied isolated policy workflow fixture.');
  await page.getByLabel('Owner approval confirmed; make this section public').check();
  await page.getByLabel('Owner-approved page text').fill('Revised owner-supplied isolated policy fixture.');
  await expect(page.getByLabel('Owner approval confirmed; make this section public')).not.toBeChecked();
  await page.getByLabel('Owner approval confirmed; make this section public').check();
  await page.getByRole('button', { name: 'Save section', exact: true }).click();
  await expect.poll(() => fixture.writes.length).toBe(1);
  expect(fixture.writes[0].payload).toEqual({ privacyPolicy: { title: 'Isolated Privacy Policy', body: 'Revised owner-supplied isolated policy fixture.', approved: true } });
  expect(fixture.writes[0].csrf).toBeTruthy();
});

test('category editor reuses protected category API and preserves audited references', async ({ page }) => {
  const fixture = await websiteFixture(page);
  await page.goto('/admin/website/categories');
  await page.getByRole('button', { name: 'Edit', exact: true }).click();
  await page.getByLabel('Display order', { exact: true }).fill('2');
  await page.getByRole('button', { name: 'Save category', exact: true }).click();
  await expect.poll(() => fixture.writes.length).toBe(1);
  expect(fixture.writes[0].path).toBe('category');
  expect(fixture.writes[0].payload).toMatchObject({ name: category.name, slug: category.slug, parentId: null, order: 2 });
  expect(fixture.writes[0].csrf).toBeTruthy();
});

test('delivery diagnostics and payment settings are read-only and responsive on a 320px phone', async ({ page }) => {
  const fixture = await websiteFixture(page);
  const pageErrors = [];
  page.on('pageerror', (error) => pageErrors.push(error.message));
  await page.setViewportSize({ width: 320, height: 800 });
  await page.goto('/admin/website/notifications');
  await expect(page.getByText('SMTP_ACCEPTANCE_UNCERTAIN')).toBeVisible();
  await expect(page.getByText(/automatic retries are suppressed/)).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  await page.getByRole('link', { name: 'Payment settings', exact: true }).click();
  await expect(page.getByText(/disabled pending launch approval/)).toBeVisible();
  await expect(page.getByText('Full-payment transfer number: 01060673073')).toBeVisible();
  await expect(page.getByRole('button', { name: /Enable checkout|Send|Retry email/ })).toHaveCount(0);
  expect(fixture.writes).toHaveLength(0);
  expect(pageErrors).toEqual([]);
});

test('normal customers cannot reach website administration', async ({ page }) => {
  const fixture = await websiteFixture(page, { role: 'customer' });
  await page.goto('/admin/website/reviews');
  await expect(page.getByText(/administrator|admin access/i).first()).toBeVisible();
  await expect(page.getByRole('button', { name: 'Add review', exact: true })).toHaveCount(0);
  expect(fixture.writes).toHaveLength(0);
});

test('bundle editor saves explicit homepage publication and uses the existing product-name search contract', async ({ page }) => {
  const fixture = await websiteFixture(page);
  const saved = [];
  const headers = { 'Access-Control-Allow-Origin': 'http://127.0.0.1:5191', 'Access-Control-Allow-Credentials': 'true', 'Access-Control-Allow-Headers': 'content-type,x-csrf-token', 'Access-Control-Allow-Methods': 'GET,POST,PATCH,OPTIONS' };
  await page.route('**/api/v1/admin/commerce/bundles**', async (route) => {
    const request = route.request();
    if (request.method() === 'OPTIONS') return route.fulfill({ status: 204, headers });
    if (request.method() === 'POST') { saved.push(request.postDataJSON()); return route.fulfill({ headers, json: { ok: true, data: { bundle: { _id: '777777777777777777777777', ...saved[0] } } } }); }
    return route.fulfill({ headers, json: { ok: true, data: { bundles: [], pagination: { page: 1, limit: 20, total: 0, pages: 0 } } } });
  });
  await page.goto('/admin/commerce/bundles');
  await page.getByRole('button', { name: 'Add bundle', exact: true }).click();
  await page.getByLabel('Bundle name', { exact: true }).fill('Isolated owner bundle');
  await page.getByLabel('Owner-approved bundle description').fill('Owner-approved isolated bundle description.');
  await page.getByLabel('Active', { exact: true }).check();
  await page.getByLabel('Publish eligible bundle on homepage').check();
  await page.getByLabel('Fixed discount (EGP)').fill('5');
  await page.getByRole('button', { name: 'Add bundle product', exact: true }).click();
  await page.getByLabel('Find product', { exact: true }).fill('Gift 01');
  await page.getByRole('button', { name: 'Find products', exact: true }).click();
  await expect.poll(() => fixture.requests.filter((request) => request.path === '/admin/products' && request.params.q === 'Gift 01').length).toBeGreaterThan(0);
  await page.getByRole('combobox', { name: /^Product/ }).first().selectOption(cards[0]._id);
  await page.getByRole('button', { name: 'Add bundle product', exact: true }).click();
  await page.getByRole('combobox', { name: /^Product/ }).nth(1).selectOption(cards[1]._id);
  await page.getByRole('button', { name: 'Save configuration', exact: true }).click();
  await expect.poll(() => saved.length).toBe(1);
  expect(saved[0]).toMatchObject({ published: true, active: true, description: 'Owner-approved isolated bundle description.', discountValue: 500 });
  expect(saved[0].items).toHaveLength(2);
  expect(fixture.requests.filter((request) => request.path === '/admin/products').every((request) => !request.params.search)).toBe(true);
});

test('subcategory editing keeps homepage selection main-only and preserves omitted feature metadata', async ({ page }) => {
  const fixture = await websiteFixture(page);
  await page.goto('/admin/website/categories');
  await page.getByRole('combobox', { name: /^Category group/ }).selectOption(category.slug);
  await page.getByRole('button', { name: 'Edit', exact: true }).click();
  await expect(page.getByLabel('Featured on homepage (main categories only)')).toBeDisabled();
  await expect(page.getByText(/any existing subcategory feature metadata is preserved/)).toBeVisible();
  await page.getByRole('button', { name: 'Save category', exact: true }).click();
  await expect.poll(() => fixture.writes.length).toBe(1);
  expect(fixture.writes[0].payload.parentId).toBe(category._id);
  expect(fixture.writes[0].payload).not.toHaveProperty('featured');
});
