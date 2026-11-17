import { saveCartItem } from './cart-assertions.js';
import { confirmedCartAdd, confirmedCartAddAndOpen } from './background-cart-assertions.js';
import { mkdir } from 'node:fs/promises';
import { test, expect, api, post, image, choose, open, words, review, cart } from './visual-engraving-fixture.js';
const screenshotDir = '../local-data/production-fixes/connected-screenshots';

test('Gift Box photo uploads continue across navigation and render inside one confirmed cart item',async({page,context})=>{
  test.setTimeout(120000);let signs=0,adds=0;
  page.on('request',request=>{if(request.method()==='POST'&&request.url().endsWith('/uploads/sign'))signs++;if(request.method()==='POST'&&request.url().endsWith('/cart/items'))adds++;});
  await page.route('**/commerce/uploads/*/complete',async route=>{const response=await route.fetch();await new Promise(resolve=>setTimeout(resolve,700));return route.fulfill({response});});
  await page.goto('/customize/gift-box');await page.getByRole('button',{name:'Choose Synthetic box-2',exact:true}).click();
  await page.getByRole('button',{name:'Fill With Flowers',exact:true}).click();await page.getByRole('button',{name:'Add Synthetic rose-red',exact:true}).click();
  await page.getByRole('button',{name:'Make It Personal',exact:true}).click();const photo=await image(page,200,150);await choose(page,'Choose your photos',[1,2,3].map(index=>({...photo,name:`synthetic-${index}.png`})));await expect(page.locator('.gb-free-photo')).toHaveCount(3);
  await page.getByRole('button',{name:'Finishing Touches',exact:true}).click();await page.getByRole('button',{name:'Next: Review',exact:true}).click();
  await page.getByRole('button',{name:'Add Your Gift to Cart',exact:true}).click();await expect(page.locator('.personalized-add-progress')).toBeVisible();
  await page.locator('[data-cart-anchor]').first().click();await expect(page).toHaveURL('/cart');
  const gift=page.getByRole('article',{name:'Gift Box',exact:true});await expect(gift).toBeVisible();
  await expect(gift.locator('.cart-v2-photo .gb-free-photo img')).toHaveCount(3);expect((await cart(context)).items).toHaveLength(1);expect(signs).toBe(3);expect(adds).toBe(1);
  await expect(page.locator('.personalized-add-progress')).toHaveCount(0);
});
async function screenshot(page, name, width) {
  await mkdir(screenshotDir,{recursive:true}); await page.setViewportSize({width,height:1000});
  await page.evaluate(() => document.fonts.ready); await page.evaluate(() => window.scrollTo(0,0));
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.screenshot({path:`${screenshotDir}/${name}-${width}.png`,fullPage:true});
}
async function details(page) {
  await page.getByLabel(/^Full name/).fill('Synthetic Handover Customer');
  await page.getByLabel('Phone number').fill('01012345678');
  await page.getByLabel(/^Governorate/).selectOption('cairo');
  await page.getByLabel(/^City \/ Area/).fill('Synthetic City');
  await page.getByLabel(/^Street address/).fill('10 Synthetic Street');
}

test('standalone compact steps and original-color artwork remain usable at all handover widths', async ({page,context}) => {
  test.setTimeout(120000); const errors=[];page.on('pageerror',error=>errors.push(error.message));
  await open(page);
  await choose(page,/Engraving surface: Choose surface photo/,await image(page));
  for(const width of [320,390,768,1024,1440]) await screenshot(page,'engraving-item',width);
  await page.getByRole('button',{name:'Design Your Engraving',exact:true}).click();
  await words(page,'A lasting memory');
  await choose(page,/Engraving artwork: Add image artwork/,await image(page,400,200));
  for(const width of [320,390,768,1024,1440]) {
    await screenshot(page,'engraving-design',width);
    const footer=await page.locator('.sv-footer').boundingBox(), price=await page.locator('.sv-total strong').boundingBox();
    const back=await page.getByRole('button',{name:'Back',exact:true}).boundingBox(), primary=await page.getByRole('button',{name:'Review Your Engraving',exact:true}).boundingBox();
    expect(Math.abs(price.x+price.width-footer.x-footer.width)).toBeLessThan(2);
    expect(Math.abs(primary.x+primary.width-footer.x-footer.width)).toBeLessThan(2);
    expect(Math.abs(back.x-footer.x)).toBeLessThan(2);
    expect(Math.abs(back.y+back.height/2-primary.y-primary.height/2)).toBeLessThan(2);
    for(const control of await page.locator('.ve-transform-controls button').all()) {
      const bounds=await control.boundingBox(), panel=await page.locator('.ve-workspace').boundingBox();
      expect(bounds.x+bounds.width).toBeLessThanOrEqual(panel.x+panel.width+1);
    }
    expect(await page.locator('.ve-layout').evaluate(node=>getComputedStyle(node).display)).toBe(width>=1024?'grid':'flex');
  }
  await review(page);
  for(const width of [320,390,768,1024,1440]) await screenshot(page,'engraving-review',width);
  await confirmedCartAdd(page, () => page.getByRole('button',{name:'Add to Cart',exact:true}).click());
  const items=(await cart(context)).items;expect(items).toHaveLength(1);
  const spec=(await(await context.request.get(`${api}/commerce/engraving/cart/${items[0].id}`)).json()).data.specification;
  expect(spec.design.layers.map(layer=>layer.type)).toEqual(['text','image']);
  expect(spec.placement).toEqual({kind:'help'});expect(errors).toEqual([]);
});

test('guest checkout recovers lost proof and order acknowledgements using the same private records', async ({page,context,browser}) => {
  test.setTimeout(120000);await page.goto('/products/connected-catalog-batch3-1');
  await saveCartItem(page, () => page.getByRole('button',{name:'Add to Cart',exact:true}).first().click());
  const proofRequests=[],orderRequests=[],signedProofs=[];let loseProof=true,loseOrder=true;
  page.on('request',request=>{if(request.method()==='POST'&&request.url().endsWith('/uploads/sign')&&request.postDataJSON()?.purpose==='payment_proof')signedProofs.push(request.postDataJSON());});
  await page.route('**/commerce/checkout/payments/*/proof',async route=>{proofRequests.push(route.request().postDataJSON());const response=await route.fetch();expect(response.ok()).toBe(true);if(loseProof){loseProof=false;await route.abort('failed');}else await route.fulfill({response});});
  await page.route('**/commerce/orders',async route=>{if(route.request().method()!=='POST')return route.fallback();orderRequests.push(route.request().postDataJSON());const response=await route.fetch();expect(response.ok()).toBe(true);if(loseOrder){loseOrder=false;await route.abort('failed');}else await route.fulfill({response});});
  await page.goto('/checkout');await details(page);await page.getByRole('radio',{name:/InstaPay/}).check();await expect(page.getByRole('button',{name:'View transfer details',exact:true})).toHaveCount(0);
  await expect(page.getByRole('button',{name:'Copy transfer destination'})).toBeVisible();
  await expect(page.getByRole('button',{name:'Place Order',exact:true})).toBeDisabled();
  await page.getByLabel('Transfer sender name *').fill('Synthetic Handover Sender');
  await choose(page,/InstaPay: Choose screenshot/,await image(page,300,200));
  await expect(page.getByRole('button',{name:'Place Order',exact:true})).toBeEnabled();
  for(const width of [320,390,768,1024,1440])await screenshot(page,'instapay-before-submit',width);
  await page.getByRole('button',{name:'Place Order',exact:true}).click();
  await page.getByRole('button',{name:'Retry same submission',exact:true}).click();
  await expect(page.getByRole('heading',{name:'Thank you for your order!',exact:true})).toBeVisible();
  expect(signedProofs).toHaveLength(1);expect(proofRequests).toHaveLength(1);expect(orderRequests).toHaveLength(2);expect(orderRequests[0]).toEqual(orderRequests[1]);
  const id=(await page.getByRole('main').getByRole('link',{name:'Track Order'}).getAttribute('href')).split('/').at(-1);
  await page.reload();await expect(page.getByRole('heading',{name:'Thank you for your order!',exact:true})).toBeVisible();
  const accepted=(await(await context.request.get(`${api}/commerce/orders/${id}`)).json()).data.order;
  expect(accepted.paymentState).toBe('awaiting_verification');expect(accepted.customer.email).toBe('');expect(accepted.customer.addressVersion).toBe('delivery-address-v3');
  const outsider=await browser.newContext();try{expect((await outsider.request.get(`${api}/commerce/orders/${id}`)).status()).toBe(404);}finally{await outsider.close();}
  expect(JSON.stringify(await page.evaluate(()=>({...localStorage,...sessionStorage})))).not.toMatch(/Synthetic Handover|Synthetic Street|blob:|data:image|synthetic-private/);
  for(const width of [320,390,768,1024,1440])await screenshot(page,'receipt',width);
  await page.getByRole('main').getByRole('link',{name:'Track Order'}).click();await expect(page).toHaveURL(new RegExp(`/orders/${id}$`));
});

test('all five line families share safe InstaPay checkout; sticker details and manual scroll remain intact',async({page,context})=>{
  test.setTimeout(120000);await open(page);await choose(page,/Engraving surface: Choose surface photo/,await image(page));
  await page.getByRole('button',{name:'Design Your Engraving',exact:true}).click();await words(page,'Synthetic keepsake');await review(page);await saveCartItem(page, () => page.getByRole('button',{name:'Add to Cart',exact:true}).click());
  const product=(await(await context.request.get(`${api}/public/products/connected-catalog-batch3-1`)).json()).data.product;
  expect((await post(context,'/commerce/cart/items',{productId:product._id,quantity:1})).ok()).toBe(true);
  await page.goto('/products/connected-engraving-product');await page.getByRole('button',{name:'Add Engraving',exact:true}).click();const dialog=page.getByRole('dialog');await dialog.getByLabel('Engraving text',{exact:true}).fill('For Nour');await expect(dialog.getByRole('button',{name:'Add to Cart',exact:true})).toBeEnabled();await dialog.getByRole('button',{name:'Add to Cart',exact:true}).click();await expect(dialog.getByRole('heading',{name:'Your personalized product is in the cart',exact:true})).toBeVisible();await page.keyboard.press('Escape');
  await page.goto('/products/connected-ready-made-photo-box');const area=page.getByRole('region',{name:'Personal photo choices',exact:true});await area.getByRole('checkbox',{name:/Add my personal photos/}).check();await choose(page,/Your personal photos: Choose photos/,await image(page,150,100));await area.getByRole('button',{name:'Add to Cart',exact:true}).click();await expect(area.getByRole('status').filter({hasText:'saved'})).toBeVisible();
  await page.goto('/customize/gift-box');await page.getByRole('button',{name:'Choose Synthetic box-2',exact:true}).click();await page.getByRole('button',{name:'Fill With Flowers',exact:true}).click();await page.getByRole('button',{name:'Add Synthetic rose-red',exact:true}).click();await page.getByRole('button',{name:'Make It Personal',exact:true}).click();await choose(page,'Choose your photos',await image(page,200,150));
  const sticker=page.getByLabel('Write a name, special date, or heartfelt message');await sticker.fill('A special day');
  for(const width of [320,390,768,1024,1440])await screenshot(page,'gift-sticker',width);
  await page.setViewportSize({width:390,height:900});await sticker.focus();await expect.poll(()=>sticker.evaluate(node=>{const rect=node.getBoundingClientRect();return rect.top>=document.querySelector('.site-header-stack').getBoundingClientRect().bottom&&rect.bottom<=innerHeight;})).toBe(true);await page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));const position=await page.evaluate(()=>{window.scrollBy(0,-80);return scrollY;});await page.evaluate(()=>window.visualViewport?.dispatchEvent(new Event('resize')));await page.waitForTimeout(100);expect(await page.evaluate(()=>scrollY)).toBe(position);
  await page.getByRole('button',{name:'Finishing Touches',exact:true}).click();await page.getByRole('button',{name:'Next: Review',exact:true}).click();
  await confirmedCartAddAndOpen(page, () => page.getByRole('button',{name:'Add Your Gift to Cart',exact:true}).click());
  const gift=page.getByRole('article',{name:'Gift Box',exact:true});await gift.getByRole('button',{name:'View Design Details',exact:true}).click();await expect(gift.locator('dl').getByText('Photo prints',{exact:true})).toBeVisible();await expect(gift.locator('dl').getByText('A special day',{exact:true})).toBeVisible();await expect(gift.getByText(/Personal touches per box/)).toHaveCount(0);await expect(gift.locator('.sticker-proof-image')).toBeVisible();await expect(gift.locator('.cart-v2-photo').getByRole('img',{name:'Photo 1',exact:true})).toBeVisible();await expect(gift.locator('.private-photo-thumbnail')).toHaveCount(0);
  const mixed=await cart(context);expect(mixed.items).toHaveLength(5);expect(mixed.items.filter(item=>item.kind==='product')).toHaveLength(3);
  await page.goto('/checkout');await details(page);await expect(page.getByRole('radio',{name:/Cash on Delivery/})).toBeChecked();await expect(page.getByRole('radio',{name:/InstaPay/})).toBeVisible();await page.getByRole('radio',{name:/InstaPay/}).check();await expect(page.getByRole('button',{name:'View transfer details',exact:true})).toHaveCount(0);await page.getByLabel('Transfer sender name *').fill('Synthetic Mixed Sender');await choose(page,/InstaPay: Choose screenshot/,await image(page,300,200));await expect(page.getByRole('button',{name:'Place Order',exact:true})).toBeEnabled();await page.getByRole('button',{name:'Place Order',exact:true}).click();await expect(page.getByRole('heading',{name:/Thank you for your order!/})).toBeVisible();
  const id=(await page.getByRole('main').getByRole('link',{name:'Track Order'}).getAttribute('href')).split('/').at(-1),accepted=(await(await context.request.get(`${api}/commerce/orders/${id}`)).json()).data.order;
  expect(accepted.lines).toHaveLength(5);expect(accepted.lines.find(line=>line.kind==='gift_box_v2').giftBox.personalization.sticker.placement).toEqual(mixed.items.find(line=>line.kind==='gift_box_v2').giftBox.personalization.sticker.placement);expect(accepted.lines.find(line=>line.kind==='gift_box_v2').unitPricePiastres).toBe(mixed.items.find(line=>line.kind==='gift_box_v2').unitPricePiastres);expect(accepted.engravingPaymentPolicy).toBe('standalone-checkout-payment-v1');expect(accepted.paymentObligations.reduce((sum,group)=>sum+group.amountPiastres,0)).toBe(accepted.totals.totalPiastres);expect(accepted.engravingWorkflow.collectionAuthorized).toBe(false);
});
