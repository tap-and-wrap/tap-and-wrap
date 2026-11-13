import { ownerFixture } from './owner-dashboard-fixtures.js';
import { test, expect } from '@playwright/test';
import { mockCatalog } from './catalog-fixtures.js';
import { fixedPages, fixedFaq, publicContacts } from '../../shared/storefront-content.mjs';

test('information pages remain centered and readable at phone, tablet and desktop sizes', async ({ page }) => {
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await mockCatalog(page);
  for (const width of [320, 390, 768, 1440]) {
    await page.setViewportSize({ width, height: 900 });
    for (const [slug, record] of Object.entries(fixedPages)) {
      await page.goto(`/${slug}`);
      await expect(page.locator('h1')).toHaveText(record.title);
      await expect(page.getByRole('navigation', { name: 'On this page' })).toHaveCount(0);
      await expect(page.locator('.information-support,.information-related,.information-review')).toHaveCount(0);
      const copy=await page.locator('.information-copy').boundingBox();
      expect(copy.width).toBeLessThanOrEqual(850);
      expect(Math.abs(copy.x+copy.width/2-width/2)).toBeLessThan(10);
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
      await expect(page.locator('main')).not.toContainText(/Development Preview|Under Development|Coming Soon/i);
      const footer = page.getByRole('contentinfo');
      const information = footer.getByRole('navigation', { name: 'Information', exact: true });
      await expect(information.getByRole('link')).toHaveCount(5);
      for (const target of ['privacy-policy', 'refund-policy', 'shipping-policy', 'terms-of-service', 'contact']) await expect(information.getByRole('link', { name: fixedPages[target].title, exact: true })).toHaveAttribute('href', `/${target}`);
    }
    await page.screenshot({ path: `test-results/batch6-policy-${width}.png`, fullPage: true });
  }
  await page.goto('/about');
  await page.goto('/contact#questions');
  await expect(page.locator('#questions')).toBeVisible();
  for (const [index,label] of ['Orders','Shipping','Personalization'].entries()) {
    await page.getByRole('button',{name:label,exact:true}).click();
    await expect(page.locator('.home-faq-card')).toHaveCount(fixedFaq.filter(entry=>entry.category===index).length);
  }
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.screenshot({ path: 'test-results/batch6-about-desktop.png', fullPage: true });
  expect(errors).toEqual([]);
});

test('code-managed FAQ and policies describe the same contact, delivery and quotation rules', () => {
  expect(fixedFaq.find(item => item.question.startsWith('When will')).answer).toContain('initial WhatsApp contact within 12 hours');
  const giftBoxAnswer = fixedFaq.find(item => item.question === 'How does Build Your Gift Box work?').answer;
  expect(giftBoxAnswer).toContain('add your Gift Box to the same cart as other gifts');
  expect(giftBoxAnswer).toContain('Checkout offers COD or InstaPay; delivery is confirmed separately.');
  expect(fixedPages['shipping-policy'].sections.flatMap(s => s.paragraphs).join(' ')).toContain('not EGP 0 or free shipping');
  expect(fixedPages['refund-policy'].sections.flatMap(s => s.paragraphs).join(' ')).toContain('Personalization never excludes remedies');
  expect(publicContacts.whatsapp).not.toBe('01060673073');
});

test('retired content bookmark redirects to the owner dashboard on a small phone', async ({ page }) => {
  await ownerFixture(page);
  await page.setViewportSize({ width: 320, height: 900 });
  await page.goto('/admin/website/content');
  await expect(page).toHaveURL('/admin');
  await expect(page.getByRole('heading', { name: 'Dashboard', exact: true })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});
