import { test, expect } from '@playwright/test';
import { ownerFixture } from './owner-dashboard-fixtures.js';
for (const width of [320, 1440]) test(`admin notification history remains inside the bell at ${width}px`, async ({ page }) => {
 await ownerFixture(page); await page.setViewportSize({ width, height: 900 }); await page.goto('/admin/notifications');
 await expect(page).toHaveURL('http://127.0.0.1:5191/admin');
 const bell = page.getByRole('button', { name: /Admin notifications/ }); await expect(bell).toHaveAttribute('aria-label', /13 unread/); await bell.click();
 const panel=page.getByRole('dialog',{name:'Notifications',exact:true}); await expect(panel.locator('li')).toHaveCount(5);
 await panel.getByRole('button',{name:'Show More',exact:true}).click(); await expect(panel.locator('li')).toHaveCount(10);
 await panel.getByRole('button',{name:'Mark all as read'}).click(); await expect(panel.getByText('0 unread',{exact:true})).toBeVisible();
 await page.keyboard.press('Escape'); await expect(bell).toBeFocused(); await expect(bell).not.toHaveAttribute('aria-label',/unread/);
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
 await page.locator('.account-signout').click(); await page.getByRole('dialog',{name:'Sign out of Tap & Wrap?'}).getByRole('button',{name:'Sign out',exact:true}).click(); await expect(bell).toHaveCount(0); await expect(panel).toHaveCount(0);
});
