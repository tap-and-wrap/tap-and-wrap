import { test, expect } from '@playwright/test';
import { mockCatalog, adminProduct } from './catalog-fixtures';

test('product editor retains a stale merchant draft and reloads the protected detail revision explicitly', async ({ page }) => {
  await mockCatalog(page, { role: 'admin' });
  const record = structuredClone(adminProduct);
  const writes = [];
  const headers = { 'Access-Control-Allow-Origin': 'http://127.0.0.1:5191', 'Access-Control-Allow-Credentials': 'true', 'Access-Control-Allow-Headers': 'content-type,x-csrf-token', 'Access-Control-Allow-Methods': 'GET,PATCH,OPTIONS' };
  await page.route(`**/api/v1/admin/products/${record._id}`, async (route) => {
    if (route.request().method() === 'OPTIONS') return route.fulfill({ status: 204, headers });
    if (route.request().method() === 'PATCH') {
      const { expectedRevision, ...patch } = route.request().postDataJSON();
      writes.push({ expectedRevision, ...patch });
      if (expectedRevision !== record.revision) return route.fulfill({ status: 409, headers, json: { ok: false, error: { code: 'EDIT_CONFLICT', message: 'Product changed.' } } });
      Object.assign(record, patch, { revision: record.revision + 1 });
    }
    return route.fulfill({ headers, json: { ok: true, data: { product: record } } });
  });
  await page.goto(`/admin/products/${record._id}/edit`);
  await page.getByLabel('Product name', { exact: true }).fill('My unsaved product name');
  record.name = 'Other editor product name'; record.revision = 1;
  await page.getByRole('button', { name: 'Save changes', exact: true }).click();
  await expect(page.getByText('Another editor changed this record. Your unsaved changes are still here. Copy any changes you need before reloading.', { exact: true })).toBeVisible();
  await expect(page.getByLabel('Product name', { exact: true })).toHaveValue('My unsaved product name');
  expect(record.name).toBe('Other editor product name');
  await page.getByRole('button', { name: 'Reload latest record', exact: true }).click();
  await page.getByRole('button', { name: 'Confirm reload and discard draft', exact: true }).click();
  await expect(page.getByLabel('Product name', { exact: true })).toHaveValue('Other editor product name');
  await page.getByLabel('Product name', { exact: true }).fill('Reviewed latest product name');
  await page.getByRole('button', { name: 'Save changes', exact: true }).click();
  await expect(page.getByText('Changes saved.', { exact: true })).toBeVisible();
  expect(writes.map((write) => write.expectedRevision)).toEqual([0, 1]);
  expect(writes.every((write) => !Object.hasOwn(write, 'personalization') && !Object.hasOwn(write, 'customization'))).toBe(true);
});
