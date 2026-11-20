import { test, expect } from '@playwright/test';
import { ownerFixture, ownerOrders } from './owner-dashboard-fixtures.js';

for (const width of [390, 1440]) {
  test(`v11 owner dashboard and orders are free from operational queues at ${width}px`, async ({ page }) => {
    const fixture = await ownerFixture(page);
    await page.setViewportSize({ width, height: 900 });
    await page.goto('/admin');
    await expect(page.getByRole('heading', { name: 'Recent orders' })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Manage your store' })).toBeVisible();
    await expect(page.getByRole('button', { name: /Admin notifications/ })).toHaveCount(0);
    await expect(page.getByRole('heading', { name: 'Action center' })).toHaveCount(0);
    await page.goto('/admin/orders');
    await expect(page.getByRole('button', { name: 'Requires action' })).toHaveCount(0);
    await expect(page.getByText('Checkout payment recovery')).toHaveCount(0);
    await expect(page.getByRole('region', { name: 'Orders' })).toBeVisible();
    await expect(page.getByRole('link', { name: `View order #${ownerOrders[0].orderNumber}` })).toBeVisible();
    expect(fixture.ownerCalls.filter(url => /\/notifications|\/attention/.test(url.pathname))).toHaveLength(0);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  });
  test(`v11 gift box administration has components but no appearance or packing panels at ${width}px`, async ({ page }) => {
    await ownerFixture(page);
    await page.setViewportSize({ width, height: 900 });
    await page.goto('/admin/gift-box');
    await expect(page.getByRole('heading', { name: 'Gift Box', exact: true, level: 1 })).toBeVisible();
    await expect(page.getByRole('link', { name: 'Components & stock' })).toBeVisible();
    await expect(page.getByRole('link', { name: 'Personalization' })).toBeVisible();
    await expect(page.getByText('Box appearance & arrangement settings', { exact: true })).toHaveCount(0);
    await expect(page.getByText('Safe packing & box availability', { exact: true })).toHaveCount(0);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  });
}
