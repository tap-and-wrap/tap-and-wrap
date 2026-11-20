import { test, expect } from '@playwright/test';
import { ownerFixture } from './owner-dashboard-fixtures.js';
for (const width of [320, 1440]) test(`legacy admin notifications redirect to the clean dashboard at ${width}px`, async ({ page }) => {
  const fixture = await ownerFixture(page); await page.setViewportSize({ width, height: 900 });
  await page.goto('/admin/notifications'); await expect(page).toHaveURL(/\/admin$/);
  await expect(page.getByRole('heading',{name:'Dashboard',exact:true})).toBeVisible();
  await expect(page.getByRole('button',{name:/Admin notifications/})).toHaveCount(0);
  await expect(page.getByRole('heading',{name:'Action center'})).toHaveCount(0);
  expect(fixture.ownerCalls.filter(url => /\/notifications|\/attention/.test(url.pathname))).toHaveLength(0);
  expect(await page.evaluate(() => document.documentElement.scrollWidth<=innerWidth)).toBe(true);
});
