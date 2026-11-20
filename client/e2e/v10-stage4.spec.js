import { expect, test } from '@playwright/test';
import { giftBoxFixture } from './gift-box-fixtures.js';
import { mockCommerce } from './commerce-fixtures.js';

// This suite uses isolated fixtures only. No real carts, uploads or payments.
const message = 'كل سنة وأنت بخير ❤️\nWishing you a lovely day <b>literally</b>!';
const giftBox = {
  box: {componentId:'box-2',displayName:'Fixture gift box'}, items:[],
  ribbon:null, giftCard:{selected:true,message}, personalization:{photoCount:0},
};
const cart = { items:[{
  id:'gift-line-v10',kind:'gift_box_v2',name:'Gift Box',quantity:1,valid:true,
  unitPricePiastres:20000,lineTotalPiastres:20000,giftBox,
}],subtotalPiastres:20000,quantity:1 };
const preview = page => page.locator('[aria-label="Gift card details"]');

for (const width of [320,390,1440]) {
  test(`saved gift-card preview matches cart and checkout at ${width}px`,async({page})=>{
    await page.setViewportSize({width,height:920});
    const fixture = await mockCommerce(page,{cart,checkoutEnabled:true});
    await page.goto('/cart');
    await page.getByRole('button',{name:'View Design Details'}).click();
    await expect(page.locator('.commerce-gift-summary').getByText(message, {exact:true})).toBeVisible();
    await expect(page.locator('.commerce-gift-summary bdi')).toContainText([message]);
    await page.goto('/checkout');
    await expect(preview(page)).toBeVisible();
    await expect(preview(page)).toHaveClass(/tw-gift-card-details--compact/);
    await expect(preview(page).locator('.tw-gift-card-details__value')).toHaveText(message);
    await expect(preview(page).locator('.tw-gift-card-details__value')).toHaveCSS('white-space','pre-wrap');
    await expect(page.locator('.commerce-total')).toContainText('200.00');
    expect(fixture.calls.filter(call => call.method === 'POST' && /\/commerce\/(?:cart\/gift-box|checkout\/payments|orders)/.test(call.path))).toHaveLength(0);
    expect(await page.evaluate(()=>document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  });
}

test('Gift Box review uses the same message proof without adding price twice',async({page})=>{
  await giftBoxFixture(page);
  await page.goto('/customize/gift-box');
  await page.getByRole('button',{name:'Choose Fixture box-2',exact:true}).click();
  await page.getByRole('button',{name:'Finishing Touches',exact:true}).click();
  await page.getByRole('checkbox',{name:'Add a Gift Card'}).check(); await page.getByLabel('Message (optional)').fill(message);
  await expect(page.locator('.gb-live-total strong')).toContainText('20.00');
  await page.getByRole('button',{name:'Next: Review'}).click();
  await expect(preview(page)).toBeVisible();
  await expect(preview(page).locator('.tw-gift-card-details__value')).toHaveText(message);
  await expect(page.locator('.gb-live-total strong')).toContainText('20.00');
});

test('engraving media references protected local poster and video',async({page})=>{
  await mockCommerce(page);
  await page.goto('/customize');
  await expect(page.getByRole('heading',{name:'Something made just for them'})).toBeVisible();
  await expect(page.locator('.home-service-media')).toHaveCount(2);

  // The source remains a protected, locally served MP4 even when a fixture
  // browser cannot decode it and ServiceFilm correctly falls back to poster.
  const [poster,video]=await Promise.all([
    page.request.get('/media/tap-wrap-laser-engraving-poster.webp'),
    page.request.get('/media/tap-wrap-laser-engraving.mp4'),
  ]);
  expect(poster.status()).toBe(200);
  expect(poster.headers()['content-type']).toMatch(/image\/webp/i);
  expect(video.status()).toBe(200);
  expect(video.headers()['content-type']).toMatch(/video\/mp4/i);

  // Source hydration/owner verification may replace the route subtree during
  // its initial paint. Re-query in the page instead of scrolling a detached
  // Playwright element. Either playable video or the designed poster fallback
  // is a valid media presentation, but the references must remain exact.
  await expect.poll(async()=>page.evaluate(()=>{
    const film=document.querySelectorAll('.home-service-media')[1];
    if(!film)return 'waiting';
    film.scrollIntoView({block:'center',behavior:'instant'});
    const video=film.querySelector('video');
    if(video){
      const correct=video.getAttribute('poster')==='/media/tap-wrap-laser-engraving-poster.webp'
        && video.getAttribute('src')==='/media/tap-wrap-laser-engraving.mp4'
        && Boolean(film.querySelector('button[aria-label*="Laser Engraving video"]'));
      return correct?'video-ready':'waiting';
    }
    const poster=film.querySelector('img');
    return poster?.getAttribute('src')==='/media/tap-wrap-laser-engraving-poster.webp'?'poster-fallback':'waiting';
  }),{timeout:12000}).toMatch(/^(video-ready|poster-fallback)$/);
});
