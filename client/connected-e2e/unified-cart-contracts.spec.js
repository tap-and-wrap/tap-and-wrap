import {test,expect} from '@playwright/test';
const api=`http://127.0.0.1:${process.env.TAP_WRAP_CONTRACT_API_PORT}`;
const web=`http://127.0.0.1:${process.env.TAP_WRAP_CONTRACT_WEB_PORT}`;
test.skip(process.env.TAP_WRAP_CONTRACT_GIFT_SHOPPING!=='true','Requires disposable Gift Box shopping fixture.');
test('real Product + Gift Box cart is eligible, reprices quantities, confirms removals and quotes without creating an order',async({page,context,request},info)=>{
  await context.route('**/*',route=>{const url=new URL(route.request().url());return ['127.0.0.1','localhost'].includes(url.hostname)||['blob:','data:'].includes(url.protocol)?route.continue():route.abort();});
  const state=await(await request.get(`${api}/__fixture/state`,{headers:{'x-fixture-key':'connected-fixture-only'}})).json();
  const csrf=async()=>({Origin:web,'x-csrf-token':(await(await context.request.get(`${api}/api/v1/auth/csrf`)).json()).data.csrfToken});
  const added=await context.request.post(`${api}/api/v1/commerce/cart/items`,{headers:await csrf(),data:{productId:state.giftBoxV2.ordinaryProductId,quantity:1}});expect(added.status()).toBe(201);
  await page.goto('/customize/gift-box');await page.getByRole('button',{name:'Choose Synthetic box-2',exact:true}).click();await page.getByRole('button',{name:'Fill With Flowers',exact:true}).click();await page.getByRole('button',{name:'Add Synthetic rose-red',exact:true}).click();await page.getByRole('button',{name:'Finishing Touches',exact:true}).click();await page.getByRole('button',{name:'Next: Review'}).click();await page.getByRole('button',{name:'Add Your Gift to Cart',exact:true}).click();await expect(page).toHaveURL('/cart');
  const gift=page.getByRole('article',{name:'Gift Box',exact:true});
  await expect(page.getByRole('link',{name:'Proceed to Checkout'})).toBeVisible();
  await gift.getByRole('button',{name:'Increase quantity for Gift Box'}).click();await expect(gift.locator('output')).toHaveText('2');
  const response=(await(await context.request.get(`${api}/api/v1/commerce/cart`)).json()).data;
  expect(response.checkoutEnabled).toBe(true);expect(response.cart.items).toHaveLength(2);expect(response.cart.items.find(item=>item.kind==='product')).not.toHaveProperty('checkoutAllowed');
  await gift.getByRole('button',{name:'View Design Details'}).click();await expect(gift).toContainText('Synthetic rose-red');
  await gift.getByRole('button',{name:'Remove Gift Box',exact:true}).click();await page.getByRole('button',{name:'Keep item'}).click();await expect(gift).toBeVisible();
  for(const width of [320,390,440,768,1024,1440]){await page.setViewportSize({width,height:900});expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);await page.screenshot({path:info.outputPath(`real-mixed-${width}.png`),fullPage:true});}
  const quote=await context.request.post(`${api}/api/v1/commerce/checkout/quote`,{headers:await csrf(),data:{checkoutKey:crypto.randomUUID(),paymentMethod:'instapay',governorate:'cairo'}});expect(quote.status(),await quote.text()).toBe(200);
  const after=await(await request.get(`${api}/__fixture/state`,{headers:{'x-fixture-key':'connected-fixture-only'}})).json();expect(after.orderCount).toBe(state.orderCount);expect(after.giftBoxV2.settingQuantities).toEqual(state.giftBoxV2.settingQuantities);
});
