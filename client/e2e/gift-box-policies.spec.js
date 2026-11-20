import { expect, test } from '@playwright/test';
import { mockCommerce } from './commerce-fixtures.js';

test('retired Gift Box packing and appearance panels have no customer/admin entry points', async ({ page }) => {
  await mockCommerce(page, { role: 'admin' });
  await page.goto('/admin/gift-box/fulfillment-policies');
  await expect(page).toHaveURL(/\/admin\/gift-box\?tab=components$/);
  await expect(page.getByRole('heading', { name: 'Gift Box', exact: true, level: 1 })).toBeVisible();
  await expect(page.locator('.owner-workspace-tabs a')).toHaveCount(2);
  for (const text of ['Box appearance & arrangement settings', 'Safe packing & box availability', 'Packing trial evidence', 'Approve saved policy'])
    await expect(page.getByText(text, { exact: true })).toHaveCount(0);
  await page.goto('/admin/gift-box?tab=visuals');
  await expect(page).toHaveURL(/\?tab=components$/);
  await page.goto('/admin/gift-box?tab=packing');
  await expect(page).toHaveURL(/\?tab=components$/);
});

test('Gift Box component and personalization routes remain accessible to an admin', async ({ page }) => {
  await mockCommerce(page, { role: 'admin' });
  await page.goto('/admin/gift-box?tab=components');
  await expect(page.getByRole('heading', { name: 'Gift Box', exact: true, level: 1 })).toBeVisible();
  await expect(page.getByRole('link', { name: 'Personalization', exact: true })).toBeVisible();
  await page.getByRole('link', { name: 'Personalization', exact: true }).click();
  await expect(page).toHaveURL(/tab=personalization/);
  await expect(page.getByText('Safe packing & box availability')).toHaveCount(0);
});

test('retired packing administration is not exposed to customers', async ({ page }) => {
  await mockCommerce(page, { role: 'customer' });
  await page.goto('/admin/gift-box/fulfillment-policies');
  await expect(page.getByRole('heading', { name: 'Access denied' })).toBeVisible();
});
