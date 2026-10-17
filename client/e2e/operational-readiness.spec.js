import { test, expect } from '@playwright/test';
import { mockCommerce } from './commerce-fixtures.js';
import { renderEmailTemplate } from '../../server/src/email/templates.js';
const headers = { 'Access-Control-Allow-Origin': 'http://127.0.0.1:5191', 'Access-Control-Allow-Credentials': 'true', 'Access-Control-Allow-Headers': 'content-type,x-csrf-token', 'Access-Control-Allow-Methods': 'GET,POST,OPTIONS' };
const id = '710000000000000000000099';
async function fixture(page, { conflict = false, lost = false } = {}) {
  await mockCommerce(page, { role: 'admin' }); const writes = []; let contacted = false, revision = 0;
  const timing = () => ({ submittedAt: '2026-10-15T09:00:00.000Z', dueAt: '2026-10-15T21:00:00.000Z', contactedAt: contacted ? '2026-10-16T10:00:00.000Z' : null, remainingMs: 0, overdue: !contacted });
  await page.route('**/api/v1/admin/commerce/**', async route => {
    if (route.request().method() === 'OPTIONS') return route.fulfill({ status: 204, headers });
    const path = new URL(route.request().url()).pathname;
    const reply = data => route.fulfill({ headers, json: { ok: true, data } });
    if (path.endsWith('/contact')) {
      const body = route.request().postDataJSON(); writes.push(body);
      if (conflict) return route.fulfill({ status: 409, headers, json: { ok: false, error: { code: 'EDIT_CONFLICT', message: 'This record changed. Your note is retained.' } } });
      if (lost && writes.length === 1) return route.abort('failed');
      contacted = true; revision = 1; return reply({ recorded: true });
    }
    if (path.endsWith('/operations')) return reply({ readiness: { provider: 'resend', deliveryReady: false, ownerAlertsConfigured: false }, historicalHeld: 12, lastRun: null, failedRuns: [{ state: 'interrupted' }], events: [{ _id: id, event: 'owner_new', audience: 'owner', state: 'uncertain', attempts: 1, createdAt: '2026-10-15T09:00:00Z' }], serverNow: '2026-10-16T10:00:00Z' });
    if (path.endsWith('/attention')) return reply({ records: [{ id, kind: 'order', reference: '123456', revision, customer: { name: 'Synthetic Customer' }, createdAt: '2026-10-15T09:00:00Z', responseState: contacted ? 'waiting_customer' : 'requires_action', paymentState: 'awaiting_transfer', fulfillmentState: 'received', flags: contacted ? ['shipping'] : ['initial', 'overdue', 'shipping'], timing: timing(), href: `/admin/commerce/orders/${id}` }], pagination: { page: 1, pages: 1, total: 1 } });
    if (path.endsWith(`/attention/order/${id}`)) return reply({ id, revision, timing: timing(), contactHistory: contacted ? [{ at: '2026-10-16T10:00:00Z', action: 'contact', note: 'Actually contacted through WhatsApp' }] : [], messages: [{ key: 'initial', text: 'Tap & Wrap | Order #123456\nDelivery: Pending Confirmation. No transfer requested.', url: 'https://wa.me/201012345678?text=synthetic' }] });
    return route.fallback();
  });
  return { writes };
}
test('mobile attention shows overdue and explicit contact action without sending WhatsApp or changing payment', async ({ page }) => {
  const data = await fixture(page), errors = []; page.on('pageerror', error => errors.push(error.message));
  await page.setViewportSize({ width: 320, height: 900 }); await page.goto('/admin/attention');
  await expect(page.getByText('Overdue — contact the customer now', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Contact and actions for 123456' }).click();
  await expect(page.getByRole('link', { name: 'Open WhatsApp manually' })).toHaveAttribute('href', /^https:\/\/wa.me\//); expect(data.writes).toHaveLength(0);
  await page.getByLabel('Private contact / response note').fill('Actually contacted through WhatsApp'); await page.getByRole('button', { name: 'Mark as Contacted', exact: true }).click();
  await expect(page.getByText('Contact record saved. Payment and acceptance are unchanged.')).toBeVisible(); await expect(page.getByText('Overdue — contact the customer now', { exact: true })).toHaveCount(0);
  expect(data.writes[0].action).toBe('contact'); expect(data.writes[0].revision).toBe(0); expect(data.writes[0].paymentState).toBeUndefined();
  for (const width of [320, 768, 1440]) { await page.setViewportSize({ width, height: 900 }); expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true); }
  await page.setViewportSize({ width: 320, height: 900 }); await page.evaluate(() => window.scrollTo(0, 0)); await page.screenshot({ path: 'test-results/batch5-attention-320.png', fullPage: true }); expect(errors).toEqual([]);
});
test('stale contact revisions preserve the note and offer reload instead of overwriting', async ({ page }) => {
  await fixture(page, { conflict: true }); await page.goto('/admin/attention'); await page.getByRole('button', { name: 'Contact and actions for 123456' }).click(); await page.getByLabel('Private contact / response note').fill('Actual contact evidence kept locally'); await page.getByRole('button', { name: 'Mark as Contacted', exact: true }).click();
  await expect(page.getByRole('alert')).toContainText('record changed'); await expect(page.getByLabel('Private contact / response note')).toHaveValue('Actual contact evidence kept locally'); await expect(page.getByRole('button', { name: 'Reload latest record; keep note' })).toBeVisible();
});
test('uncertain contact response retries the identical operation and diagnostics never offer blind resend', async ({ page }) => {
  const data = await fixture(page, { lost: true }); await page.goto('/admin/attention'); await page.getByRole('button', { name: 'Contact and actions for 123456' }).click(); await page.getByLabel('Private contact / response note').fill('Actual contact evidence'); await page.getByRole('button', { name: 'Mark as Contacted', exact: true }).click(); await page.getByRole('button', { name: 'Retry same contact action' }).click();
  await expect(page.getByText('Contact record saved. Payment and acceptance are unchanged.')).toBeVisible(); expect(data.writes[1]).toEqual(data.writes[0]); await expect(page.getByText(/Delivery uncertain; verify provider records/)).toBeVisible(); await expect(page.getByRole('button', { name: 'Close without resending' })).toBeDisabled();
});

test('branded transactional and owner emails remain readable on mobile without tracking or private files', async ({ page }) => {
  for (const owner of [false, true]) {
    const email = renderEmailTemplate({ event: owner ? 'owner_contact_reminder' : 'order_received', audience: owner ? 'owner' : 'customer', snapshot: { orderNumber: '123456', reference: '123456', phone: '+201012345678', submittedAt: '2026-10-15T09:00:00.000Z', dueAt: '2026-10-15T21:00:00.000Z', accountingVersion: 1, totalPiastres: 45000, paymentMethod: 'instapay', paymentState: 'awaiting_transfer', shippingState: 'pending', items: [{ name: 'Synthetic thoughtful gift', quantity: 1 }], financial: { collectedPiastres: 0, refundedPiastres: 0, outstandingPiastres: 45000 }, charges: [{ label: 'Delivery', amountPiastres: null, state: 'pending' }] } }, { clientOrigin: 'https://shop.example.test' });
    if (owner) { const actualOwner = renderEmailTemplate({ event: 'owner_contact_reminder', audience: 'owner', snapshot: { reference: '123456', phone: '+201012345678', service: 'regular_order', submittedAt: '2026-10-15T09:00:00.000Z', dueAt: '2026-10-15T21:00:00.000Z', merchandisePiastres: 45000 } }, { clientOrigin: 'https://shop.example.test' }); Object.assign(email, actualOwner); }
    await page.setViewportSize({ width: 320, height: 900 }); await page.setContent(email.html);
    await expect(page.getByText('Unlock the Magic of Giving', { exact: true })).toBeVisible(); expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    if (owner) await expect(page.getByRole('link', { name: 'Contact on WhatsApp', exact: true })).toHaveAttribute('href', /^https:\/\/wa.me\//); else await expect(page.getByText(/Pending delivery is not free shipping/)).toBeVisible();
    await page.screenshot({ path: `test-results/batch5-${owner ? 'owner' : 'customer'}-email-320.png`, fullPage: true });
  }
});
