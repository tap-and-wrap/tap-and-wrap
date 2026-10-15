import { test, expect } from '@playwright/test';
import { mockCatalog, category } from './catalog-fixtures.js';
import { approvedFaqFallback } from '../src/content/final-faq.js';

test('named testimonial marquee pauses and reduced motion exposes one complete copy', async ({ page }) => {
  await mockCatalog(page); await page.goto('/');
  for (const width of [1440, 390]) {
    await page.setViewportSize({ width, height: 900 });
    const control = page.getByRole('button', { name: /Pause hero video|Play hero video/ });
    await page.getByRole('heading', { level: 1 }).click();
    await expect(control).toHaveCSS('opacity', '0');
    await page.keyboard.press('Tab');
    await control.focus();
    await expect(control).toHaveCSS('opacity', '1');
    await page.keyboard.press('Tab');
    await expect(control).toHaveCSS('opacity', '0');
  }
  await page.setViewportSize({ width: 1440, height: 900 });
  const groups = page.locator('.review-marquee-group');
  await expect(groups.first().locator('figure')).toHaveCount(12);
  await expect(groups.nth(1)).toHaveAttribute('aria-hidden', 'true');
  await expect(groups.first().locator('.review-marquee-rating')).toHaveText(Array(12).fill('★★★★★'));
  await expect(page.getByRole('button', { name: /Pause reviews|Resume reviews/ })).toHaveCount(0);
  await expect(page.getByText('Customer feedback translated or lightly edited for clarity.')).toHaveCount(0);
  const window = page.locator('.review-marquee-window');
  const bounds = await window.boundingBox();
  expect(bounds.x).toBe(0);
  expect(bounds.width).toBe(await page.evaluate(() => document.documentElement.getBoundingClientRect().width));
  await window.focus();
  expect(await page.locator('.review-marquee-track').evaluate(node => getComputedStyle(node).animationPlayState)).toBe('paused');
  await page.emulateMedia({ reducedMotion: 'reduce' });
  expect(await page.locator('.review-marquee-track').evaluate(node => getComputedStyle(node).animationName)).toBe('none');
  await expect(groups.nth(1)).toBeHidden();
});

test('FAQ categories preserve all eleven exact approved answers', async ({ page }) => {
  await mockCatalog(page); await page.goto('/');
  for (const width of [1440, 320]) {
    await page.setViewportSize({ width, height: 900 });
    const positions = await page.locator('.home-faq-categories button').evaluateAll(buttons => buttons.map(button => button.getBoundingClientRect().top));
    expect(Math.max(...positions) - Math.min(...positions)).toBeLessThan(1);
  }
  for (const [label, count] of [['Orders', 4], ['Shipping', 4], ['Personalization', 3]]) {
    await page.getByRole('button', { name: label, exact: true }).click();
    const questions = page.locator('.home-faq-card');
    await expect(questions).toHaveCount(count);
    for (const question of await questions.all()) {
      const button = question.getByRole('button');
      const text = await button.innerText();
      const original = approvedFaqFallback.find(entry => text.startsWith(entry.question));
      expect(original).toBeTruthy();
      await button.click();
      await expect(button).toHaveAttribute('aria-expanded', 'true');
      await expect(question.locator('p')).toHaveText(original.answer);
      await button.click();
      await expect(question.locator('p')).toBeHidden();
    }
  }
});

test('mobile category dots follow scrolling and reach actual end positions on one row', async ({ page }) => {
  await mockCatalog(page);
  await page.route('**/api/v1/public/categories?*', route => route.fulfill({
    headers: { 'Access-Control-Allow-Origin': 'http://127.0.0.1:5191', 'Access-Control-Allow-Credentials': 'true' },
    json: { ok: true, data: { categories: Array.from({ length: 12 }, (_, index) => ({ ...category, _id: `category-${index}`, slug: `category-${index}`, name: `Category ${index}`, productCount: 0 })), pagination: { page: 1, pages: 1, total: 12 } } },
  }));
  await page.setViewportSize({ width: 320, height: 900 }); await page.goto('/');
  const dots = page.locator('.home-slide-dot');
  await expect(dots).toHaveCount(5);
  const rail = page.locator('.home-category-grid');
  await rail.evaluate(node => { node.scrollLeft = node.scrollWidth; });
  await expect(page.getByRole('button', { name: 'Next categories', exact: true })).toBeDisabled();
  await expect(dots.last()).toHaveAttribute('aria-current', 'true');
  const row = await page.locator('.home-category-navigation').evaluate(node => [...node.children].map(child => child.getBoundingClientRect().y + child.getBoundingClientRect().height / 2));
  expect(Math.max(...row) - Math.min(...row)).toBeLessThan(1);
  await dots.first().click();
  await expect(dots.first()).not.toHaveAttribute('aria-current', 'true');
  await expect.poll(() => rail.evaluate(node => node.scrollLeft < node.scrollWidth - node.clientWidth - 3)).toBe(true);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
});
