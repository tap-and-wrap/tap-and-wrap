import { test, expect } from '@playwright/test';
import { mockCommerce } from './commerce-fixtures.js';

const cors = { 'access-control-allow-origin': 'http://127.0.0.1:5191', 'access-control-allow-credentials': 'true' };
for (const width of [320, 1440]) {
  test(`admin bell, notification history and mark-as-read work at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    await mockCommerce(page, { role: 'admin' });
    let viewed = false;
    await page.route('**/api/v1/admin/commerce/notifications**', route => {
      const method = route.request().method();
      if (method === 'OPTIONS') return route.fulfill({ status: 204, headers: cors });
      if (method === 'POST') { viewed = true; return route.fulfill({ headers: cors, json: { ok: true, data: { readAt: new Date().toISOString() } } }); }
      const notice = { id: 'request:507f1f77bcf86cd799439011', kind: 'request', reference: 'TW-ABCDEF123456', title: 'Follow-up due soon · Request TW-ABCDEF123456', detail: 'Request TW-ABCDEF123456 · submitted', at: new Date().toISOString(), unread: !viewed, followup: 'soon', href: '/admin/requests/507f1f77bcf86cd799439011' };
      const params = new URL(route.request().url()).searchParams;
      const data = { notifications: viewed && params.get('view') === 'unread' ? [] : [notice], unreadCount: viewed ? 0 : 1, pagination: { page: 1, total: viewed && params.get('view') === 'unread' ? 0 : 1, pages: viewed && params.get('view') === 'unread' ? 0 : 1 }, serverNow: new Date().toISOString() };
      return route.fulfill({ headers: cors, json: { ok: true, data } });
    });
    await page.goto('/admin/notifications');
    const headerBell = page.getByRole('button', { name: /Admin notifications/ });
    await expect(headerBell).toBeVisible();
    await expect(headerBell).toHaveAttribute('aria-label', /1 unread/);
    await headerBell.click();
    await expect(page.getByRole('region', { name: 'Recent admin notifications' })).toBeVisible();
    await page.getByRole('link', { name: 'View all notifications' }).click();
    await expect(page.getByRole('heading', { name: 'Notifications', exact: true, level: 1 })).toBeVisible();
    await expect(page.getByText('Follow-up due soon · Request TW-ABCDEF123456').last()).toBeVisible();
    await page.getByRole('button', { name: 'Mark all as read' }).click();
    await expect(headerBell).not.toHaveAttribute('aria-label', /unread/);
    await page.getByLabel('Show notifications').selectOption('unread');
    await expect(page.getByText('No notifications in this view.')).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  });
}
