import { test, expect } from '@playwright/test';
import { mkdir } from 'node:fs/promises';
import { mockCommerce, commerceProduct, cartWithProduct, fillCheckout } from './commerce-fixtures.js';
import { mockCatalog } from './catalog-fixtures.js';

const screenshots = '../local-data/final-handover/screenshots';
test('only the clicked product card shows loading during a delayed add', async ({ page }) => {
  await mockCommerce(page);
  const second = { ...commerceProduct, _id: '710000000000000000000002', slug: 'another-isolated-gift', name: 'Another isolated gift' };
  await page.route('**/public/products?*', route => route.fulfill({ json: { ok: true, data: { products: [commerceProduct, second], pagination: {page:1,pages:1,total:2}, priceBounds: null } } }));
  let release;
  await page.route('**/commerce/cart/items', async route => { await new Promise(resolve => { release = resolve; }); await route.fallback(); });
  await page.goto('/shop');
  const first = page.getByRole('button', { name: `Add to Cart: ${commerceProduct.name}`, exact: true });
  const other = page.getByRole('button', { name: `Add to Cart: ${second.name}`, exact: true });
  await first.click();
  await expect(first).toHaveText('Please wait…');
  await expect(other).toHaveText('Add to Cart');
  await expect(other).toBeDisabled();
  release();
  await expect(first).toHaveText('Add to Cart');
  await expect(other).toBeEnabled();
});

for (const width of [320,390,768,1024,1440]) test(`storefront, product, cart and checkout composition at ${width}px`, async ({ page }) => {
  const errors = []; page.on('pageerror', error => errors.push(error.message));
  await mkdir(screenshots, {recursive:true});
  await page.setViewportSize({width,height:900});
  await page.emulateMedia({reducedMotion:'reduce'});
  await mockCommerce(page, {checkoutEnabled:true, cart:cartWithProduct()});
  await page.goto('/');
  await expect(page.getByRole('heading', {name:/Make their heart/})).toBeVisible();
  await page.evaluate(() => document.fonts.ready);
  await page.evaluate(() => window.scrollTo(0,0));
  await page.screenshot({path:`${screenshots}/home-${width}.png`,fullPage:true});
  const coordinates = async () => page.locator('.site-logo').evaluate(element => ({x:element.getBoundingClientRect().x,width:element.getBoundingClientRect().width}));
  const home = await coordinates();
  await page.goto('/shop');
  await expect(page.locator('.catalog-card')).toHaveCount(1);
  await page.evaluate(() => document.fonts.ready);
  expect(await coordinates()).toEqual(home);
  await expect(page.locator('#catalog-sort')).toHaveValue('featured');
  await page.evaluate(() => window.scrollTo(0,0));
  await page.screenshot({path:`${screenshots}/shop-${width}.png`,fullPage:true});
  await page.goto(`/products/${commerceProduct.slug}`);
  await page.getByText('Shipping', {exact:true}).click();
  await expect(page.getByText('The delivery fee is confirmed separately.',{exact:false})).toBeVisible();
  await expect(page.getByText('Prices and availability are verified when adding to your cart.')).toHaveCount(0);
  await page.evaluate(() => window.scrollTo(0,0));
  await page.screenshot({path:`${screenshots}/product-${width}.png`,fullPage:true});
  await page.goto('/cart');
  await expect(page.getByRole('button',{name:'View Details',exact:true})).toHaveCount(0);
  await expect(page.getByText('Product',{exact:true})).toHaveCount(0);
  await page.evaluate(() => window.scrollTo(0,0));
  await page.screenshot({path:`${screenshots}/cart-${width}.png`,fullPage:true});
  await page.goto('/checkout');
  await fillCheckout(page);
  await page.getByLabel('Email (optional)',{exact:true}).fill('');
  await page.getByLabel('Building / Floor / Apartment (optional)').fill('Building A, floor 2');
  await expect(page.locator('input[type=date]')).toHaveCount(0);
  await page.evaluate(() => window.scrollTo(0,0));
  await page.screenshot({path:`${screenshots}/checkout-${width}.png`,fullPage:true});
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.getByRole('button',{name:'Place Order',exact:true}).click();
  await expect(page.getByRole('heading',{name:/Thank you, order/})).toBeVisible();
  await expect(page.getByRole('link',{name:'View order status'})).toBeVisible();
  expect(errors).toEqual([]);
});

test('legacy discovery URLs map to the native Featured selection', async ({page}) => {
  const fixture = await mockCatalog(page);
  await page.goto('/shop?sort=discovery');
  await expect(page.locator('#catalog-sort')).toHaveValue('featured');
  await expect(page.locator('#catalog-sort option')).not.toContainText(['Discover']);
  expect(fixture.requests.some(request => request.path === '/public/products' && request.params.sort === 'featured')).toBe(true);
});

test('rapid rejected card clicks produce one operation and restore both ordinary labels',async({page})=>{
  const fixture=await mockCommerce(page,{rejectAdd:true}),second={...commerceProduct,_id:'710000000000000000000002',name:'Another isolated gift'};
  await page.route('**/public/products?*',route=>route.fulfill({json:{ok:true,data:{products:[commerceProduct,second],pagination:{page:1,pages:1,total:2}}}}));
  await page.goto('/shop');const first=page.getByRole('button',{name:`Add to Cart: ${commerceProduct.name}`,exact:true}),other=page.getByRole('button',{name:`Add to Cart: ${second.name}`,exact:true});
  await first.click({clickCount:2});await expect(page.getByRole('status').filter({hasText:'This product is no longer available.'})).toBeVisible();await expect(first).toHaveText('Add to Cart');await expect(other).toHaveText('Add to Cart');expect(fixture.calls.filter(call=>call.path==='/commerce/cart/items'&&call.method==='POST')).toHaveLength(1);
});

test('a pending guest add cannot leave loading labels in the signed-in storefront',async({page})=>{
  await mockCommerce(page);let release;
  await page.route('**/commerce/cart/items',async route=>{await new Promise(resolve=>{release=resolve;});await route.fallback().catch(()=>{});});
  await page.goto('/shop');await page.getByRole('button',{name:`Add to Cart: ${commerceProduct.name}`,exact:true}).click();await expect(page.getByRole('button',{name:`Add to Cart: ${commerceProduct.name}`,exact:true})).toHaveText('Please wait…');
  await page.goto('/login');await page.getByLabel('Email Address').fill('isolated@example.test');await page.getByLabel('Password',{exact:true}).fill('isolated-test-password');await page.getByRole('button',{name:'Log In',exact:true}).click();await expect(page).not.toHaveURL(/\/login/);await page.goto('/shop');
  const button=page.getByRole('button',{name:`Add to Cart: ${commerceProduct.name}`,exact:true});await expect(button).toHaveText('Add to Cart');await expect(button).toBeEnabled();release();await expect(button).toHaveText('Add to Cart');
});

test('curated home questions link to fuller support and confirmed feedback remains truthful',async({page})=>{
  await mockCommerce(page);await page.goto('/');await page.getByRole('link',{name:'All questions and support',exact:true}).click();await expect(page).toHaveURL('/contact#questions');await expect(page.getByRole('heading',{name:'Questions about your gift',exact:true})).toBeVisible();
  await page.getByRole('button',{name:'Personalization',exact:true}).click();await page.getByRole('button',{name:'How do I add my personal photos?',exact:true}).click();await expect(page.getByText(/There is no automatic photo surcharge/)).toBeVisible();
  await expect(page.locator('.site-footer a[href="/about"]')).toHaveCount(0);await expect(page.locator('.site-footer .footer-brand p')).toHaveCount(0);
  await page.goto('/reviews');await expect(page.getByLabel('Customer feedback confirmed by Tap & Wrap.',{exact:true})).toHaveCount(64);await expect(page.getByText('64 customer testimonials, shared in Arabic and English.')).toHaveCount(0);
});


test('an as-is photo-capable product keeps its edit action without an empty disclosure',async({page})=>{
  const selected=cartWithProduct();selected.items[0].photoPurchase={contractVersion:'product-photos-v2',mode:'as_is',configurationVersion:1,collectionKey:'customer_photos'};
  await mockCommerce(page,{cart:selected});await page.goto('/cart');await expect(page.getByRole('button',{name:/View.*Details/})).toHaveCount(0);await expect(page.getByRole('link',{name:'Edit photo choices',exact:true})).toHaveAttribute('href',`/products/${commerceProduct.slug}?photoEdit=line-1`);
});
