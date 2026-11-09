import { test, expect } from '@playwright/test';
import { mockCatalog } from './catalog-fixtures.js';
import { adminLinks } from '../src/admin/navigation.js';

for (const role of [null, 'customer', 'admin']) for (const width of [320, 360, 390, 768, 1024, 1440]) {
  test(`${role || 'guest'} navigation at ${width}px`, async ({ page }, info) => {
    const errors = []; page.on('pageerror', error => errors.push(error.message));
    await mockCatalog(page, { role }); await page.setViewportSize({ width, height: 1000 });
    await page.goto('/shop');
    await expect(page.locator('header a.header-account')).toHaveAttribute('href', role === 'admin' ? '/admin' : role ? '/my-orders' : '/login');
    await expect(page.getByRole('button', { name: /^Admin notifications/ })).toHaveCount(role === 'admin' ? 1 : 0);
    await expect(page.locator('header [data-cart-anchor]')).toBeVisible();
    if(width<1024 && role==='admin'){
      const cart=await page.locator('header [data-cart-anchor]').boundingBox(),bell=await page.getByRole('button',{name:/^Admin notifications/}).boundingBox();
      expect(cart.width).toBeGreaterThanOrEqual(44);expect(bell.width).toBeGreaterThanOrEqual(44);expect(cart.x-bell.x-bell.width).toBeGreaterThanOrEqual(12);
    }
    if (width < 1024) {
      await expect(page.locator('header .header-account')).toBeHidden();
      const trigger = page.getByRole('button', { name: 'Open menu', exact: true });
      await expect(trigger.locator('svg')).toHaveClass(/lucide-menu/);
      await expect(trigger).not.toContainText('Menu');
      const logo = await page.locator('.site-logo').boundingBox();
      expect(Math.abs(logo.x + logo.width / 2 - width / 2)).toBeLessThan(2);
      const actions=await page.locator('.header-actions').boundingBox();expect(logo.x+logo.width).toBeLessThanOrEqual(actions.x);
      await trigger.click();
      const drawer = page.getByRole('dialog', { name: 'Main menu' });
      const entry = drawer.locator('.drawer-account a').first();
      await expect(entry).toHaveText(role === 'admin' ? 'Dashboard' : role ? 'My Account' : 'Sign In');
      await expect(entry.locator('svg')).toHaveClass(/lucide-user-round/);
      await expect(entry.locator('svg')).toBeVisible();
      await expect(drawer.getByRole('button', { name: 'Sign out', exact: true })).toHaveCount(0);
      const header = await drawer.locator('.drawer-header').boundingBox();
      const account=await drawer.locator('.drawer-account').boundingBox(),bounds=await drawer.boundingBox();
      expect(bounds.y+bounds.height-account.y-account.height).toBeLessThan(40);
      const first = await drawer.locator('.drawer-nav > ul > li').first().boundingBox();
      expect(first.y - header.y - header.height).toBeLessThan(35);
      await drawer.screenshot({ path: info.outputPath('drawer.png'), animations: 'disabled' });
      await page.keyboard.press('Escape'); await expect(drawer).toHaveCount(0); await expect(trigger).toBeFocused();
    } else {
      await expect(page.locator('header .header-account')).toBeVisible();
      await expect(page.getByRole('button', { name: 'Open menu' })).toHaveCount(0);
      await expect(page.locator('.desktop-navigation')).toBeVisible();
    }
    await page.locator('.site-header').screenshot({ path: info.outputPath('header.png') });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    if (role === 'admin') {
      await page.goto('/admin/categories');
      if (width < 1024) {
        await page.getByRole('button', { name: 'Open menu' }).click();
        const drawer = page.getByRole('dialog', { name: 'Administration menu' });
        await expect(drawer.locator('.drawer-nav > ul > li')).toHaveCount(adminLinks.length);
        await expect(drawer.getByRole('button', { name: 'Sign out', exact: true })).toHaveCount(0);
        await expect(drawer.locator('.drawer-account a').first().locator('svg')).toBeVisible();
        await drawer.getByText('Customization', { exact: true }).click();
        await expect(drawer.getByRole('link', { name: 'Standalone Engraving', exact: true })).toHaveAttribute('href', '/admin/engraving');
        await drawer.screenshot({ path: info.outputPath('admin-drawer.png'), animations: 'disabled' });
        await page.keyboard.press('Escape'); await expect(drawer).toHaveCount(0);
      } else await expect(page.locator('.desktop-navigation > ul > li')).toHaveCount(8);
    }
    expect(errors).toEqual([]);
  });
}

test('mobile menu account scrolling keeps all eight admin sections accessible with reduced motion',async({page})=>{
  await mockCatalog(page,{role:'admin'});await page.emulateMedia({reducedMotion:'reduce'});await page.setViewportSize({width:390,height:390});await page.goto('/admin/categories');
  await page.getByRole('button',{name:'Open menu',exact:true}).click();const drawer=page.getByRole('dialog',{name:'Administration menu'});
  await expect(drawer.locator('.drawer-nav > ul > li')).toHaveCount(8);const account=drawer.getByRole('link',{name:'Dashboard',exact:true});await account.scrollIntoViewIfNeeded();await expect(account).toBeInViewport();
  expect(await drawer.locator('.drawer-nav').evaluate(n=>n.scrollTop)).toBeGreaterThan(0);
  expect(await drawer.evaluate(n=>n.getAnimations({subtree:true}).length)).toBe(0);
  await page.keyboard.press('Escape');await expect(drawer).toHaveCount(0);await expect(page.getByRole('button',{name:'Open menu',exact:true})).toBeFocused();
});
