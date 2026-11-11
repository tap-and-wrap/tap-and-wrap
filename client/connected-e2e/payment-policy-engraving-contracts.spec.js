import { test, expect, api, image, choose, start, words, add, cart } from './visual-engraving-fixture.js';

async function item(page, family) {
  if (family === 'normal') {
    await page.goto('/products/connected-catalog-batch3-1');
    await page.getByRole('button', {name:'Add to Cart',exact:true}).first().click();
    await expect(page.locator('[data-sonner-toast]').filter({hasText:'Added to your cart.'})).toBeVisible();
  } else if (family === 'photos') {
    await page.goto('/products/connected-ready-made-photo-box');
    const area=page.getByRole('region',{name:'Personal photo choices',exact:true});
    await area.getByRole('checkbox',{name:/Add my personal photos/}).check();
    await choose(page,/Your personal photos: Choose photos/,await image(page,150,100));
    await area.getByRole('button',{name:'Add to Cart',exact:true}).click();
    await expect(area.getByRole('status').filter({hasText:'saved'})).toBeVisible();
  } else if (family === 'text') {
    await page.goto('/products/connected-engraving-product');
    await page.getByRole('button',{name:'Add Engraving',exact:true}).click();
    const dialog=page.getByRole('dialog');
    await dialog.getByLabel('Engraving text',{exact:true}).fill('Synthetic inscription');
    await expect(dialog.getByRole('button',{name:'Add to Cart',exact:true})).toBeEnabled();
    await dialog.getByRole('button',{name:'Add to Cart',exact:true}).click();
    await expect(dialog.getByRole('heading',{name:'Your personalized product is in the cart',exact:true})).toBeVisible();
    await page.keyboard.press('Escape');
  } else if (family === 'required') {
    await page.goto('/products/connected-personalized-product');
    await page.getByRole('button',{name:'Customize This',exact:true}).click();
    await choose(page,/^Audit photo/,await image(page,150,100));
    await page.getByRole('button',{name:'Save personalization',exact:true}).click();
    await page.getByRole('button',{name:'Add to Cart',exact:true}).click();
    await expect(page.locator('[data-sonner-toast]').filter({hasText:'Added to your cart.'})).toBeVisible();
  } else if (family === 'gift') {
    await page.goto('/customize/gift-box');
    await page.getByRole('button',{name:'Choose Synthetic box-2',exact:true}).click();
    await page.getByRole('button',{name:'Fill With Flowers',exact:true}).click();
    await page.getByRole('button',{name:'Add Synthetic rose-red',exact:true}).click();
    await page.getByRole('button',{name:'Make It Personal',exact:true}).click();
    await choose(page,'Choose your photos',await image(page,200,150));
    await page.getByLabel('Write a name, special date, or heartfelt message').fill('Synthetic gift');
    await page.getByRole('button',{name:'Finishing Touches',exact:true}).click();
    await page.getByRole('button',{name:'Next: Review',exact:true}).click();
    await page.getByRole('button',{name:'Add Your Gift to Cart',exact:true}).click();
    await expect(page).toHaveURL('/cart');
  } else if (family === 'standalone') {
    await start(page); await words(page,'Synthetic service'); await add(page);
  }
}

for(const family of ['normal','photos','text','required','gift','standalone','mixed']) {
  for(const method of ['cod','instapay']) test(`${family} policy ${method}`,async({page,context},info)=>{
    test.setTimeout(180000);
    const errors=[]; page.on('pageerror',error=>errors.push(error.message));
    const photo=await image(page);
    await page.route('https://catalog.connected.example.test/**',route=>route.fulfill({body:photo.buffer,contentType:'image/png'}));
    for(const kind of family==='mixed'?['normal','photos','text','required','gift','standalone']:[family]) await item(page,kind);
    const before=await cart(context); expect(before.items.length).toBe(family==='mixed'?6:1);
    await page.goto('/checkout');
    await page.getByLabel('Full name',{exact:true}).fill('Synthetic policy customer');
    await page.getByLabel('Egyptian mobile number').fill('01012345678');
    await page.getByLabel('Governorate',{exact:true}).selectOption('cairo');
    await page.getByLabel('City / Area',{exact:true}).fill('Synthetic city');
    await page.getByLabel('Street address',{exact:true}).fill('10 Synthetic street');
    for(const [name,value] of [['Building','A'],['Floor','2'],['Apartment','3']]) await page.getByLabel(`${name} (optional)`,{exact:true}).fill(value);
    await expect(page.getByRole('radio',{name:/Cash on Delivery|COD on agreed/})).toBeVisible();
    await expect(page.getByRole('radio',{name:/InstaPay/})).toBeVisible();
    await page.getByRole('radio',{name:method==='cod'?/Cash on Delivery|COD on agreed/:/InstaPay/}).check();
    if(family==='mixed'&&method==='cod') for(const width of [320,390,768,1440]){
      await page.setViewportSize({width,height:900});
      expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
      await page.screenshot({path:info.outputPath(`checkout-${width}.png`),fullPage:true});
    }
    await expect(page.getByRole('button',{name:'Place Order',exact:true})).toBeEnabled();
    const response=page.waitForResponse(r=>r.url().endsWith('/commerce/orders')&&r.request().method()==='POST');
    await page.getByRole('button',{name:'Place Order',exact:true}).click();
    const accepted=await response;expect(accepted.status()).toBe(201);
    const order=(await accepted.json()).data.order;
    expect(order.paymentPolicyVersion).toBe('all-methods-v1');
    expect(order.allowedPaymentMethods).toEqual(['cod','instapay']);
    expect(order.paymentMethod).toBe(method);expect(order.paymentState).toBe(method==='cod'?'unpaid':'awaiting_transfer');
    expect(order.customer).toMatchObject({addressVersion:'delivery-address-v3',building:'A',floor:'2',apartment:'3'});
    expect(order.lines).toHaveLength(before.items.length);
    expect(order.totals.totalPiastres).toBe(before.subtotalPiastres);
    if(order.engravingWorkflow) expect(order.engravingWorkflow.collectionAuthorized).toBe(false);
    await expect(page.getByRole('heading',{name:/Thank you, order/})).toBeVisible();
    const saved=(await(await context.request.get(`${api}/commerce/orders/${order.id}`)).json()).data.order;
    expect(saved.accounting.collectedPiastres).toBe(0);expect(saved.customer.apartment).toBe('3');expect((await cart(context)).items).toHaveLength(0);expect(errors).toEqual([]);
  });
}
