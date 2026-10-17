import { test, expect } from '@playwright/test';
import { mockCatalog } from './catalog-fixtures.js';
import { fixedPages, fixedFaq, publicContacts } from '../../shared/storefront-content.mjs';

test('information pages remain readable at phone, tablet and desktop sizes with working section links', async ({ page }) => {
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await mockCatalog(page);
  for (const width of [320, 390, 768, 1440]) {
    await page.setViewportSize({ width, height: 900 });
    for (const [slug, record] of Object.entries(fixedPages)) {
      await page.goto(`/${slug}`);
      await expect(page.locator('h1')).toHaveText(record.title);
      await expect(page.getByRole('navigation', { name: 'On this page' }).getByRole('link')).toHaveCount(record.sections.length);
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
      await expect(page.locator('main')).not.toContainText(/Development Preview|Under Development|Coming Soon/i);
      const footer = page.getByRole('contentinfo');
      for (const [target, value] of Object.entries(fixedPages)) await expect(footer.getByRole('link', { name: value.title, exact: true })).toHaveAttribute('href', `/${target}`);
    }
    await page.screenshot({ path: `test-results/batch6-policy-${width}.png`, fullPage: true });
  }
  await page.goto('/about');
  const sectionLink = page.getByRole('navigation', { name: 'On this page' }).getByRole('link').first();
  await sectionLink.focus();
  await expect(sectionLink).toBeFocused();
  await page.keyboard.press('Enter');
  await expect(page).toHaveURL(/#information-0$/);
  await sectionLink.blur();
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.screenshot({ path: 'test-results/batch6-about-desktop.png', fullPage: true });
  expect(errors).toEqual([]);
});

test('code-managed FAQ and policies describe the same contact, delivery and quotation rules', () => {
  expect(fixedFaq.find(item => item.question.startsWith('When will')).answer).toContain('initial WhatsApp contact within 12 hours');
  expect(fixedFaq.find(item => item.question.startsWith('How does Build')).answer).toContain('without paying or creating an account');
  expect(fixedPages['shipping-policy'].sections.flatMap(s => s.paragraphs).join(' ')).toContain('not EGP 0 or free shipping');
  expect(fixedPages['refund-policy'].sections.flatMap(s => s.paragraphs).join(' ')).toContain('Personalization never excludes remedies');
  expect(publicContacts.whatsapp).not.toBe('01060673073');
});

test('owner guide puts required actions first and remains usable on a small phone', async ({ page }) => {
  await mockCatalog(page, { role: 'admin' });
  await page.setViewportSize({ width: 320, height: 900 });
  await page.goto('/admin/website/content');
  await expect(page.getByRole('heading', { name: 'Pages, policies & owner guide' })).toBeVisible();
  await expect(page.locator('.owner-guide')).toContainText('One reminder is eligible at 9 hours');
  await expect(page.locator('.owner-guide')).toContainText('12 hours adds an overdue dashboard warning only');
  await expect(page.locator('main form')).toHaveCount(0);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.screenshot({ path: 'test-results/batch6-owner-guide-mobile.png', fullPage: true });
});
