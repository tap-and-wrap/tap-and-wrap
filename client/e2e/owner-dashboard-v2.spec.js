import { test, expect } from '@playwright/test';
import { ownerFixture, ownerOrders } from './owner-dashboard-fixtures.js';
import { mockCommerce } from './commerce-fixtures.js';

const destinations = [['/admin', 'Dashboard'], ['/admin/products', 'Products'], ['/admin/categories', 'Categories'], ['/admin/orders', 'Orders'], ['/admin/customization', 'Customization'], ['/admin/gift-box', 'Gift Box'], ['/admin/engraving', 'Standalone engraving'], ['/admin/discounts', 'Discounts'], ['/admin/payment', 'Payment'], ['/admin/customers', 'Customers'], ['/admin/analytics', 'Analytics']];
for (const width of [320, 390, 768, 1024, 1440]) test(`owner workspaces render without overflow at ${width}px`, async ({ page }, info) => {
  test.setTimeout(180000);
  const errors = []; page.on('pageerror', error => errors.push(error.message));
  await page.setViewportSize({ width, height: 1000 }); await ownerFixture(page);
  for (const [path, title] of destinations) {
    await page.goto(path);
    await expect(page.getByRole('heading', { name: title, level: 1, exact: true })).toBeVisible();
    await expect(page.locator('main [role="status"]').filter({ hasText: /^Loading/ })).toHaveCount(0);
    await expect(page.locator('.admin-header-stack')).toBeVisible();
    await expect(page.locator('.announcement,footer')).toHaveCount(0);
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth > innerWidth);
    if (overflow) console.log(JSON.stringify({ path, width, nodes: await page.evaluate(() => [...document.querySelectorAll('body *')].map(element => ({ tag: element.tagName, class: element.className, right: element.getBoundingClientRect().right, width: element.getBoundingClientRect().width })).filter(node => node.right > innerWidth).slice(0, 12)) }));
    await page.screenshot({ path: info.outputPath(`${title.replaceAll(' ', '-')}-${width}.png`), fullPage: path === '/admin' });
    expect(overflow, path).toBe(false);
  }
  await page.goto('/admin/orders');
  await expect(page.getByText('Inspect customer item', { exact: true })).toBeVisible();
  for (const type of ['Product', 'Gift Box', 'Engraving', 'Mixed']) await expect(page.locator('.owner-order-table').getByText(type, { exact: true })).toBeVisible();
  expect(errors).toEqual([]);
});

test('eight primary destinations, drawer containment, customization and storefront return', async ({ page }, info) => {
  await ownerFixture(page); await page.goto('/admin');
  const desktop = page.getByRole('navigation', { name: 'Administration', exact: true });
  await expect(desktop.locator(':scope > ul > li')).toHaveCount(8);
  await expect(page.getByRole('link', { name: 'Home — storefront' })).toHaveAttribute('href', '/');
  await page.setViewportSize({ width: 390, height: 900 });
  const opener = page.getByRole('button', { name: 'Open menu', exact: true }); await opener.click();
  const dialog = page.getByRole('dialog', { name: 'Administration menu' });
  await expect(dialog.locator('nav > ul > li')).toHaveCount(8);
  await dialog.getByText('Customization', { exact: true }).click();
  await expect(dialog.getByRole('link', { name: 'Gift Box', exact: true })).toBeVisible();
  await expect(dialog.getByRole('link', { name: 'Standalone Engraving', exact: true })).toBeVisible();
  await page.screenshot({ path: info.outputPath('mobile-drawer.png') });
  for (let index = 0; index < 18; index++) { await page.keyboard.press('Tab'); expect(await dialog.evaluate(element => element.contains(document.activeElement))).toBe(true); }
  for (let index = 0; index < 18; index++) { await page.keyboard.press('Shift+Tab'); expect(await dialog.evaluate(element => element.contains(document.activeElement))).toBe(true); }
  await page.keyboard.press('Escape'); await expect(dialog).toHaveCount(0); await expect(opener).toBeFocused();
  await page.getByRole('link', { name: 'Home — storefront' }).click();
  await expect(page.getByRole('link', { name: 'Account', exact: true })).toHaveAttribute('href', '/admin');
  await expect(page.locator('.announcement')).toBeVisible();
});

test('notification history loads five at a time, marks read and restores focus', async ({ page }, info) => {
  const fixture = await ownerFixture(page); await page.goto('/admin');
  const bell = page.getByRole('button', { name: /Admin notifications/ }); await bell.click();
  const panel = page.getByRole('dialog', { name: 'Notifications', exact: true });
  await expect(panel.locator('li')).toHaveCount(5);
  await panel.getByRole('button', { name: 'Show More', exact: true }).click(); await expect(panel.locator('li')).toHaveCount(10);
  await panel.getByRole('button', { name: 'Show More', exact: true }).click(); await expect(panel.locator('li')).toHaveCount(13);
  await expect(panel.getByRole('button', { name: 'Show More' })).toHaveCount(0);
  await panel.getByRole('button', { name: 'Mark all as read' }).click(); await expect(panel.getByText('0 unread', { exact: true })).toBeVisible();
  expect(fixture.ownerCalls.filter(url => url.pathname.endsWith('/notifications')).every(url => url.searchParams.get('limit') === '5')).toBe(true);
  await page.screenshot({ path: info.outputPath('notifications-show-more.png') });
  await page.keyboard.press('Escape'); await expect(panel).toHaveCount(0); await expect(bell).toBeFocused();
});

test('shared select supports keyboard, URL filters and escape restoration', async ({ page }, info) => {
  await ownerFixture(page); await page.goto('/admin/orders');
  const select = page.getByRole('combobox', { name: /^Item type/ });
  await select.focus(); await page.keyboard.press('Enter');
  const menu = page.getByRole('dialog', { name: 'Available options' });
  await expect(menu).toBeVisible();
  await page.getByRole('option', { name: 'Engraving', exact: true }).click();
  await expect(page).toHaveURL(/type=engraving/); await expect(select).toContainText('Engraving');
  await select.click(); await page.keyboard.press('Escape'); await expect(select).toBeFocused();
  await select.click(); await page.screenshot({ path: info.outputPath('styled-select.png') });
});

test('legacy bookmarks redirect safely and customers never receive the admin workspace', async ({ page }) => {
  await ownerFixture(page);
  for (const [old, expected] of [['/admin/website/overview', '/admin'], ['/admin/website/categories', '/admin/categories'], ['/admin/commerce/bundles', '/admin/discounts'], ['/admin/website/reviews', '/admin'], ['/admin/notifications', '/admin'], ['/admin/commerce/templates', '/admin/customization'], ['/admin/gift-box/fulfillment-policies', '/admin/gift-box?tab=packing'], [`/admin/commerce/orders/${ownerOrders[0].id}`, `/admin/orders/${ownerOrders[0].id}`]]) { await page.goto(old); await expect(page).toHaveURL(`http://127.0.0.1:5191${expected}`); }
  await page.unrouteAll({ behavior: 'wait' }); await mockCommerce(page, { role: 'customer' });
  await page.goto('/admin'); await expect(page.getByRole('heading', { name: 'Access denied' })).toBeVisible();
  await expect(page.getByRole('navigation', { name: 'Administration', exact: true })).toHaveCount(0);
});
