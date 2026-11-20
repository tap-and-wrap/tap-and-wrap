import { expect, test } from '@playwright/test';
import { ownerFixture } from './owner-dashboard-fixtures.js';
import { mockCommerce } from './commerce-fixtures.js';

const referenceA = 'aaaaaaaa-1111-4111-8111-aaaaaaaaaaaa';
const referenceB = 'bbbbbbbb-2222-4222-8222-bbbbbbbbbbbb';
const proofPng = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/U+0AAAAASUVORK5CYII=', 'base64');

for (const width of [320, 390, 1440]) {
  test(`admin recovers unaccepted InstaPay references only on the protected screen at ${width}px`, async ({ page }) => {
    const fixture = await ownerFixture(page);
    const reads = [], proofReads = [];
    await page.route('**/api/v1/admin/commerce/checkout-payments**', route => {
      const url = new URL(route.request().url());
      const headers = { 'access-control-allow-origin': 'http://127.0.0.1:5191', 'access-control-allow-credentials': 'true', 'access-control-allow-methods': 'GET,OPTIONS', 'access-control-allow-headers': 'content-type,x-csrf-token,x-tracking-consent' };
      if (route.request().method() === 'OPTIONS') return route.fulfill({ status: 204, headers });
      if (url.pathname.endsWith('/proof')) {
        proofReads.push({ method: route.request().method(), url });
        return route.fulfill({ status: 200, contentType: 'image/png', body: proofPng, headers });
      }
      reads.push({ method: route.request().method(), url });
      const payments = [
        { reference: referenceA, amountPiastres: 28100, senderName: 'Fixture Sender', proofReceived: true, proofId: 'fixture-private-upload' },
        { reference: referenceB, amountPiastres: 19200, proofReceived: false, proofId: null },
      ].filter(payment => !url.searchParams.has('reference') || payment.reference === url.searchParams.get('reference'));
      return route.fulfill({ json: { ok: true, data: { payments } }, headers });
    });
    await page.setViewportSize({ width, height: 900 });
    await page.goto('/admin/orders');
    await expect(page.getByText('Checkout payment recovery')).toHaveCount(0);
    await expect(page.getByRole('link', { name: 'Unaccepted InstaPay transfers' })).toBeVisible();
    expect(reads).toHaveLength(0);
    await page.getByRole('link', { name: 'Unaccepted InstaPay transfers' }).click();
    await expect(page).toHaveURL(/\/admin\/instapay-recovery$/);
    await expect(page.getByRole('heading', { name: 'Unaccepted InstaPay transfers', level: 1 })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Checkout payment recovery' })).toHaveAttribute('aria-expanded', 'true');
    await expect(page.getByText(referenceA)).toBeVisible();
    await expect(page.getByText(referenceB)).toBeVisible();
    expect(reads.length).toBeGreaterThan(0);
    expect(reads.every(call => call.method === 'GET')).toBe(true);
    expect(proofReads).toHaveLength(0);
    await page.getByLabel('Payment reference').fill(referenceA);
    await page.getByRole('button', { name: 'Find reference' }).click();
    await expect.poll(() => reads.at(-1)?.url.searchParams.get('reference')).toBe(referenceA);
    await expect(page.getByText(referenceB)).toHaveCount(0);
    await page.getByRole('button', { name: 'View proof' }).click();
    await expect(page.getByRole('dialog', { name: 'Checkout transfer evidence' })).toBeVisible();
    expect(proofReads).toHaveLength(1);
    expect(proofReads[0].method).toBe('GET');
    await page.getByRole('dialog').getByRole('button', { name: 'Close private file' }).click();
    await expect(page.getByRole('dialog')).toHaveCount(0);
    expect(fixture.ownerCalls.filter(url => /\/(?:attention|notifications)/.test(url.pathname))).toHaveLength(0);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  });
}

test('customer cannot open unaccepted InstaPay recovery or request its private API', async ({ page }) => {
  await mockCommerce(page, { role: 'customer' });
  const adminReads = [];
  await page.route('**/api/v1/admin/commerce/checkout-payments**', route => {
    adminReads.push(route.request().url());
    return route.fulfill({ status: 403, json: { ok: false, error: { message: 'Forbidden' } } });
  });
  await page.goto('/admin/instapay-recovery');
  await expect(page.getByRole('heading', { name: 'Access denied' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Unaccepted InstaPay transfers' })).toHaveCount(0);
  expect(adminReads).toHaveLength(0);
});
