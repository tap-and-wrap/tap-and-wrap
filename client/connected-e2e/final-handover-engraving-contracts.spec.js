import { mkdir } from 'node:fs/promises';
import { test, expect, api, post, image, choose, open, words, review, cart } from './visual-engraving-fixture.js';
const screenshotDir = '../local-data/final-handover/screenshots';
async function screenshot(page, name, width) {
  await mkdir(screenshotDir,{recursive:true}); await page.setViewportSize({width,height:1000});
  await page.evaluate(() => document.fonts.ready); await page.evaluate(() => window.scrollTo(0,0));
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.screenshot({path:`${screenshotDir}/${name}-${width}.png`,fullPage:true});
}
async function details(page) {
  await page.getByLabel('Full name',{exact:true}).fill('Synthetic Handover Customer');
  await page.getByLabel('Egyptian mobile number').fill('01012345678');
  await page.getByLabel('Governorate',{exact:true}).selectOption('cairo');
  await page.getByLabel('City / Area',{exact:true}).fill('Synthetic City');
  await page.getByLabel('Street address',{exact:true}).fill('10 Synthetic Street');
}

test('standalone compact steps and original-color artwork remain usable at all handover widths', async ({page,context}) => {
  test.setTimeout(120000); const errors=[];page.on('pageerror',error=>errors.push(error.message));
  await open(page);
  await choose(page,/Engraving surface: Choose surface photo/,await image(page));
  for(const width of [320,390,768,1024,1440]) await screenshot(page,'engraving-item',width);
  await page.getByRole('button',{name:'Design Your Engraving',exact:true}).click();
  await words(page,'A lasting memory');
  await choose(page,/Engraving artwork: Add image artwork/,await image(page,400,200));
  for(const width of [320,390,768,1024,1440]) await screenshot(page,'engraving-design',width);
  await review(page);
  for(const width of [320,390,768,1024,1440]) await screenshot(page,'engraving-review',width);
  await page.getByRole('button',{name:'Add to Cart',exact:true}).click();
  await expect(page.getByRole('heading',{name:'Your engraving is in the cart'})).toBeVisible();
  const items=(await cart(context)).items;expect(items).toHaveLength(1);
  const spec=(await(await context.request.get(`${api}/commerce/engraving/cart/${items[0].id}`)).json()).data.specification;
  expect(spec.design.layers.map(layer=>layer.type)).toEqual(['text','image']);
  expect(spec.placement).toEqual({kind:'help'});expect(errors).toEqual([]);
});

test('guest checkout owns one accepted order and recovers the integrated private InstaPay proof step after reload',async({page,context,browser})=>{
  test.setTimeout(120000); await page.goto('/products/connected-catalog-batch3-1');
  await page.getByRole('button',{name:'Add to Cart',exact:true}).first().click();
  await page.goto('/checkout'); await details(page);
  await page.getByRole('radio',{name:/InstaPay/}).check();
  await expect(page.getByRole('button',{name:'Place Order',exact:true})).toBeEnabled();
  await page.getByRole('button',{name:'Place Order',exact:true}).click();
  await expect(page.getByRole('heading',{name:/Thank you, order/})).toBeVisible();
  await expect(page.getByRole('button',{name:'Copy recipient'})).toBeVisible();
  const link=await page.getByRole('link',{name:'View order status'}).getAttribute('href'), id=link.split('/').at(-1);
  for(const width of [320,390,768,1024,1440]) await screenshot(page,'instapay',width);
  const proofRequests=[], signedProofs=[];let lostProofResponse=false;
  let failedStatusRefresh=false;await page.route(`**/commerce/orders/${id}`,async route=>{if(!failedStatusRefresh){failedStatusRefresh=true;await route.fulfill({status:503,json:{ok:false,error:{code:'SYNTHETIC_STATUS_OUTAGE',message:'Synthetic order-status refresh outage.'}}});}else await route.fallback();});
  page.on('request',request=>{if(request.method()==='POST'&&request.url().endsWith('/uploads/sign')&&request.postDataJSON()?.purpose==='payment_proof')signedProofs.push(request.postDataJSON());});
  await page.route(`**/commerce/orders/${id}/accounting`,async route=>{proofRequests.push(route.request().postDataJSON());const response=await route.fetch();if(!lostProofResponse){lostProofResponse=true;await route.abort('failed');}else await route.fulfill({response});});
  await choose(page,/InstaPay payment proof: Upload Image/,await image(page,300,200));
  await page.getByRole('button',{name:'Submit proof for this order',exact:true}).click();
  await expect(page.locator('.commerce-editor [role="alert"]')).toBeVisible();
  await page.getByRole('button',{name:'Submit proof for this order',exact:true}).click();
  expect(signedProofs).toHaveLength(1);await expect.poll(()=>proofRequests.length).toBe(2);expect(proofRequests[0]).toEqual(proofRequests[1]);
  await expect(page.getByText(/Your accepted order remains saved/)).toBeVisible();await page.getByRole('button',{name:'Refresh payment status',exact:true}).click();
  await expect(page.getByText('Your proof is awaiting review. Do not send another transfer. You can replace the screenshot if needed.')).toBeVisible();
  await page.reload();await expect(page.getByRole('heading',{name:/Thank you, order/})).toBeVisible();
  const accepted=(await(await context.request.get(`${api}/commerce/orders/${id}`)).json()).data.order;
  expect(accepted.paymentState).toBe('awaiting_verification');expect(accepted.customer.email).toBe('');expect(accepted.customer.addressVersion).toBe('delivery-address-v3');
  const outsider=await browser.newContext();try{expect((await outsider.request.get(`${api}/commerce/orders/${id}`)).status()).toBe(404);}finally{await outsider.close();}
  expect(JSON.stringify(await page.evaluate(()=>({...localStorage,...sessionStorage})))).not.toMatch(/Synthetic Handover|Synthetic Street|blob:|data:image|synthetic-private/);
  await page.getByRole('link',{name:'View order status'}).click();await expect(page).toHaveURL(new RegExp(`/orders/${id}$`));
});

test('all five line families share safe InstaPay checkout; sticker details and manual scroll remain intact',async({page,context})=>{
  test.setTimeout(120000);await open(page);await choose(page,/Engraving surface: Choose surface photo/,await image(page));
  await page.getByRole('button',{name:'Design Your Engraving',exact:true}).click();await words(page,'Synthetic keepsake');await review(page);await page.getByRole('button',{name:'Add to Cart',exact:true}).click();await expect(page.getByRole('heading',{name:'Your engraving is in the cart'})).toBeVisible();
  const product=(await(await context.request.get(`${api}/public/products/connected-catalog-batch3-1`)).json()).data.product;
  expect((await post(context,'/commerce/cart/items',{productId:product._id,quantity:1})).ok()).toBe(true);
  await page.goto('/products/connected-engraving-product');await page.getByRole('button',{name:'Add Engraving',exact:true}).click();const dialog=page.getByRole('dialog');await dialog.getByLabel('Engraving text',{exact:true}).fill('For Nour');await expect(dialog.getByRole('button',{name:'Add to Cart',exact:true})).toBeEnabled();await dialog.getByRole('button',{name:'Add to Cart',exact:true}).click();await expect(dialog.getByRole('heading',{name:'Your personalized product is in the cart',exact:true})).toBeVisible();await page.keyboard.press('Escape');
  await page.goto('/products/connected-ready-made-photo-box');const area=page.getByRole('region',{name:'Personal photo choices',exact:true});await area.getByRole('checkbox',{name:/Add my personal photos/}).check();await choose(page,/Your personal photos: Choose photos/,await image(page,150,100));await area.getByRole('button',{name:'Add to Cart',exact:true}).click();await expect(area.getByRole('status').filter({hasText:'saved'})).toBeVisible();
  await page.goto('/customize/gift-box');await page.getByRole('button',{name:'Choose Synthetic box-2',exact:true}).click();await page.getByRole('button',{name:'Fill With Flowers',exact:true}).click();await page.getByRole('button',{name:'Add Synthetic rose-red',exact:true}).click();await page.getByRole('button',{name:'Make It Personal',exact:true}).click();await choose(page,'Choose your photos',await image(page,200,150));
  const sticker=page.getByLabel('Write a name, special date, or heartfelt message');await sticker.fill('A special day');
  for(const width of [320,390,768,1024,1440])await screenshot(page,'gift-sticker',width);
  await page.setViewportSize({width:390,height:900});await sticker.focus();const position=await page.evaluate(()=>{window.scrollBy(0,-80);return scrollY;});await page.evaluate(()=>window.visualViewport?.dispatchEvent(new Event('resize')));await page.waitForTimeout(100);expect(await page.evaluate(()=>scrollY)).toBe(position);
  await page.getByRole('button',{name:'Finishing Touches',exact:true}).click();await page.getByRole('button',{name:'Next: Review',exact:true}).click();await page.getByRole('button',{name:'Add Your Gift to Cart',exact:true}).click();await expect(page).toHaveURL('/cart');
  const gift=page.getByRole('article',{name:'Gift Box',exact:true});await gift.getByRole('button',{name:'View Design Details',exact:true}).click();await expect(gift.locator('dl').getByText('Photo prints',{exact:true})).toBeVisible();await expect(gift.locator('dl').getByText('A special day',{exact:true})).toBeVisible();await expect(gift.getByText(/Personal touches per box/)).toHaveCount(0);await expect(gift.locator('.sticker-proof-image')).toBeVisible();
  const mixed=await cart(context);expect(mixed.items).toHaveLength(5);expect(mixed.items.filter(item=>item.kind==='product')).toHaveLength(3);
  await page.goto('/checkout');await details(page);await expect(page.getByRole('radio',{name:/Cash on Delivery/})).toBeChecked();await expect(page.getByRole('radio',{name:/InstaPay/})).toBeVisible();await page.getByRole('radio',{name:/InstaPay/}).check();await expect(page.getByRole('button',{name:'Place Order',exact:true})).toBeEnabled();await page.getByRole('button',{name:'Place Order',exact:true}).click();await expect(page.getByRole('heading',{name:/Thank you, order/})).toBeVisible();
  const id=(await page.getByRole('link',{name:'View order status'}).getAttribute('href')).split('/').at(-1),accepted=(await(await context.request.get(`${api}/commerce/orders/${id}`)).json()).data.order;
  expect(accepted.lines).toHaveLength(5);expect(accepted.lines.find(line=>line.kind==='gift_box_v2').giftBox.personalization.sticker.placement).toEqual(mixed.items.find(line=>line.kind==='gift_box_v2').giftBox.personalization.sticker.placement);expect(accepted.lines.find(line=>line.kind==='gift_box_v2').unitPricePiastres).toBe(mixed.items.find(line=>line.kind==='gift_box_v2').unitPricePiastres);expect(accepted.engravingPaymentPolicy).toBe('standalone-checkout-payment-v1');expect(accepted.paymentObligations.reduce((sum,group)=>sum+group.amountPiastres,0)).toBe(accepted.totals.totalPiastres);expect(accepted.engravingWorkflow.collectionAuthorized).toBe(false);
});
