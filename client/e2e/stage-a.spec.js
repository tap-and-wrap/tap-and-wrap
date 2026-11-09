import { test, expect } from '@playwright/test';
import { mockCatalog } from './catalog-fixtures.js';
import { ownerReviews, ownerFeaturedReviews } from '../src/content/owner-confirmed-reviews.js';

for (const width of [390, 1440]) test(`Stage A storefront and all reviews at ${width}px`, async ({ page }, info) => {
  const errors=[]; page.on('pageerror', error => errors.push(error.message));
  await page.setViewportSize({width,height:900}); await mockCatalog(page); await page.goto('/');
  await expect(page.locator('#home-hero-heading')).toBeVisible();
  await expect(page.getByTestId('ribbon-opening')).toHaveCount(0);
  const hero=await page.locator('.home-media-hero').boundingBox();
  expect(hero.height).toBeCloseTo(900*(width<768?.59:.65),0);
  expect(hero.y+hero.height).toBeLessThan(850);
  const first=page.locator('.review-marquee-group').first();
  await expect(first.locator('.testimonial-card')).toHaveCount(12);
  expect(await first.locator('.testimonial-card').evaluateAll(nodes=>nodes.map(n=>n.dataset.reviewId))).toEqual(ownerFeaturedReviews.map(r=>r.id));
  await page.screenshot({path:info.outputPath('home.png')});
  if(width<1024){
    const opener=page.getByRole('button',{name:'Open menu',exact:true}); await opener.click();
    const dialog=page.getByRole('dialog',{name:'Main menu'}); await expect(dialog).toBeVisible();
    await dialog.evaluate(async node => { await Promise.all(node.getAnimations({subtree:true}).map(animation => animation.finished.catch(() => {}))); });
    await expect(dialog.locator('.drawer-header')).toHaveCSS('border-bottom-width','1px');
    await expect(dialog.locator('.drawer-header')).toHaveCSS('border-bottom-color','rgb(234, 218, 213)');
    await expect(dialog.locator('.drawer-logo img')).toHaveAttribute('src','/tap-wrap-logo.webp');
    await expect(dialog.locator('.drawer-account')).toBeVisible();
    await page.screenshot({path:info.outputPath('menu.png')});
    await page.keyboard.press('Escape');await expect(dialog).toHaveCount(0);await expect(opener).toBeFocused();
  }
  await page.getByRole('link',{name:'All Customer Reviews',exact:true}).click();
  await expect(page.getByRole('heading',{name:'All Customer Reviews'})).toBeVisible();
  const cards=page.locator('.customer-reviews-grid .testimonial-card'); await expect(cards).toHaveCount(64);
  expect(await cards.evaluateAll(nodes=>nodes.map(n=>({id:n.dataset.reviewId,name:n.querySelector('bdi').textContent,text:n.querySelector('blockquote').textContent,language:n.querySelector('blockquote').lang,dir:n.querySelector('blockquote').dir,stars:n.querySelector('[aria-label="5 out of 5 stars"]')!==null})))).toEqual(ownerReviews.map(r=>({id:r.id,name:r.authorLabel,text:r.text,language:r.language,dir:r.language==='ar-EG'?'rtl':'ltr',stars:true})));
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
  await cards.last().scrollIntoViewIfNeeded(); await expect(cards.last()).toBeVisible();
  await page.screenshot({path:info.outputPath('reviews-last.png')});
  await page.getByRole('heading',{name:'All Customer Reviews'}).scrollIntoViewIfNeeded();
  await page.screenshot({path:info.outputPath('reviews.png')}); expect(errors).toEqual([]);
});

test('approved designer image configuration selects responsive sources with eager loading', async ({page}) => {
  await mockCatalog(page);
  const image={approved:true,src:'/media/tap-wrap-desktop-hero-poster.webp',mobileSrc:'/media/tap-wrap-mobile-hero-poster.webp',alt:'Test configuration using the existing approved posters'};
  await page.route('**/src/content/developer-content.js*',route=>route.fulfill({contentType:'application/javascript',body:`export const developerContent = ${JSON.stringify({heroImage:image})};`}));
  await page.setViewportSize({width:390,height:900});await page.goto('/');
  const poster=page.locator('.hero-picture img'); await expect(poster).toHaveAttribute('fetchpriority','high');
  await expect(poster).toHaveAttribute('loading','eager');
  await expect.poll(()=>poster.evaluate(node=>new URL(node.currentSrc).pathname)).toBe(image.mobileSrc);
  await page.setViewportSize({width:1440,height:900});
  await expect.poll(()=>poster.evaluate(node=>new URL(node.currentSrc).pathname)).toBe(image.src);
  await expect(page.locator('.hero-film video')).toHaveCount(0);
});
