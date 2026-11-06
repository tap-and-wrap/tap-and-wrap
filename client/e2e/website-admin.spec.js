import { ownerFixture } from './owner-dashboard-fixtures.js';
import { chooseOption } from './select-option.js';
import { test, expect } from '@playwright/test';
import { mockCatalog, category, cards } from './catalog-fixtures.js';

async function websiteFixture(page, { role = 'admin' } = {}) {
  const existing = await mockCatalog(page, { role });
  const writes = [];
  const headers = { 'Access-Control-Allow-Origin': 'http://127.0.0.1:5191', 'Access-Control-Allow-Credentials': 'true', 'Access-Control-Allow-Headers': 'content-type,x-csrf-token', 'Access-Control-Allow-Methods': 'GET,POST,PATCH,OPTIONS' };
  const content = { revision: 0, about: { title: '', body: '', approved: false, updatedAt: null }, contact: { approved: false }, faq: [], faqApproved: false };
  const categoryRecord = { ...category, revision: 0 };
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
    if (path === 'overview') return reply({ products: { listed: 5, enquiries: 4, purchasable: 1, reviewRequired: 2 }, customers: 23, pendingOrders: 0, awaitingPayment: 0, draftReviews: 0, checkoutEnabled: false, notifications: { failed: 0, dead: 0, uncertain: 0 } });
    if (path === 'customers') return reply(paginate(customers, 'customers'));
    if (path === 'notifications') return reply(paginate([{ _id: '555555555555555555555555', event: 'order_received', state: 'uncertain', attempts: 1, lastErrorCode: 'SMTP_ACCEPTANCE_UNCERTAIN', createdAt: '2026-10-09T12:00:00Z' }], 'events'));
    if (path === 'payment-settings') return reply({ checkoutEnabled: false, editable: false, launchManagedByEnvironment: true, methods: [{ key: 'cod', name: 'Cash on Delivery', verification: 'Manual collection confirmation.' }, { key: 'instapay', name: 'InstaPay', transferNumber: '01060673073', fullPaymentOnly: true, verification: 'Private proof requires manual verification.' }] });
    if (path === 'content' && request.method() === 'GET') return reply({ content });
    if (path === 'content' && request.method() === 'PATCH') { const { expectedRevision, ...patch } = request.postDataJSON(); writes.push({ path, payload: request.postDataJSON(), csrf: request.headers()['x-csrf-token'] }); if (expectedRevision !== content.revision) return reply({ code: 'EDIT_CONFLICT', message: 'This record changed after you opened it. Your changes were not saved.' }, 409); Object.assign(content, patch); content.revision += 1; return reply({ content }); }
    if (path === 'reviews' && request.method() === 'GET') return reply(paginate(reviews.map(({ text: _text, sourceNote: _source, ...item }) => item), 'reviews'));
    if (path === 'reviews' && request.method() === 'POST') { const payload = request.postDataJSON(); writes.push({ path, payload, csrf: request.headers()['x-csrf-token'] }); const review = { _id: '444444444444444444444444', ...payload, revision: 0 }; reviews.push(review); return reply({ review }, 201); }
    if (path.startsWith('reviews/')) { const review = reviews.find((item) => item._id === path.split('/')[1]); if (!review) return reply({ message: 'Review not found' }, 404); if (request.method() === 'PATCH') { const { expectedRevision, ...patch } = request.postDataJSON(); writes.push({ path, payload: request.postDataJSON() }); if (expectedRevision !== review.revision) return reply({ code: 'EDIT_CONFLICT', message: 'Review changed.' }, 409); Object.assign(review, patch); review.revision += 1; } return reply({ review }); }
    return reply({ message: `Unexpected isolated website request: ${path}` }, 404);
  });
  await page.route('**/api/v1/admin/categories/**', async (route) => {
    const request = route.request();
    if (request.method() === 'OPTIONS') return route.fulfill({ status: 204, headers });
    if (request.method() === 'GET') return route.fulfill({ headers, json: { ok: true, data: { category: categoryRecord } } });
    const payload = request.postDataJSON();
    writes.push({ path: 'category', payload, csrf: request.headers()['x-csrf-token'] });
    if (payload.expectedRevision !== categoryRecord.revision) return route.fulfill({ status: 409, headers, json: { ok: false, error: { code: 'EDIT_CONFLICT', message: 'Category changed.' } } });
    const { expectedRevision: _expected, ...patch } = payload;
    Object.assign(categoryRecord, patch, { revision: categoryRecord.revision + 1 });
    return route.fulfill({ headers, json: { ok: true, data: { category: categoryRecord } } });
  });
  return { ...existing, writes, content, reviews, categoryRecord };
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







test('stale category editor retains merchant changes and reloads the explicit detail contract', async ({ page }) => {
  const fixture = await websiteFixture(page);
  await page.goto('/admin/website/categories');
  await page.getByRole('button', { name: 'Edit', exact: true }).click();
  await page.getByLabel('Name', { exact: true }).fill('My unsaved category');
  fixture.categoryRecord.name = 'Other editor category'; fixture.categoryRecord.revision = 1;
  await page.getByRole('button', { name: 'Save category', exact: true }).click();
  await expect(page.getByText('Another editor changed this record. Your unsaved changes are still here. Copy any changes you need before reloading.', { exact: true })).toBeVisible();
  await expect(page.getByLabel('Name', { exact: true })).toHaveValue('My unsaved category');
  await page.getByRole('button', { name: 'Reload latest record', exact: true }).click();
  await page.getByRole('button', { name: 'Confirm reload and discard draft', exact: true }).click();
  await expect(page.getByLabel('Name', { exact: true })).toHaveValue('Other editor category');
  await page.getByLabel('Name', { exact: true }).fill('Reviewed latest category');
  await page.getByRole('button', { name: 'Save category', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Edit category', exact: true })).toHaveCount(0);
  expect(fixture.writes.map((write) => write.payload.expectedRevision)).toEqual([0, 1]);
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

test('Payment is read only and diagnostics are absent from owner navigation on a phone', async ({ page }) => {
 await ownerFixture(page); await page.setViewportSize({ width: 320, height: 800 }); await page.goto('/admin/payment');
 await expect(page.getByRole('heading', { name: 'Payment', exact: true, level: 1 })).toBeVisible();
 await expect(page.getByText('01060673073', { exact: true })).toBeVisible();
 await expect(page.getByRole('button', { name: /Enable checkout|Send|Retry email/ })).toHaveCount(0);
 await expect(page.getByText('SMTP_ACCEPTANCE_UNCERTAIN')).toHaveCount(0);
 expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});

test('normal customers cannot reach website administration', async ({ page }) => {
  const fixture = await websiteFixture(page, { role: 'customer' });
  await page.goto('/admin/website/reviews');
  await expect(page.getByText(/administrator|admin access/i).first()).toBeVisible();
  await expect(page.getByRole('button', { name: 'Add review', exact: true })).toHaveCount(0);
  expect(fixture.writes).toHaveLength(0);
});



test('subcategory editing keeps homepage selection main-only and preserves omitted feature metadata', async ({ page }) => {
  const fixture = await websiteFixture(page);
  await page.goto('/admin/website/categories');
  await chooseOption(page.getByRole('combobox', { name: /^Category group/ }), category.slug);
  await page.getByRole('button', { name: 'Edit', exact: true }).click();
  await expect(page.getByLabel('Featured on homepage (main categories only)')).toBeDisabled();
  await expect(page.getByText(/any existing subcategory feature metadata is preserved/)).toBeVisible();
  await page.getByRole('button', { name: 'Save category', exact: true }).click();
  await expect.poll(() => fixture.writes.length).toBe(1);
  expect(fixture.writes[0].payload.parentId).toBe(category._id);
  expect(fixture.writes[0].payload).not.toHaveProperty('featured');
});
