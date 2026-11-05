import { test, expect } from '@playwright/test';

const api = `http://127.0.0.1:${process.env.TAP_WRAP_CONTRACT_API_PORT}/api/v1`;
const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAIAAACQd1PeAAAACXBIWXMAAAPoAAAD6AG1e1JrAAAADElEQVQImWO4NbsXAARVAgOYIL6CAAAAAElFTkSuQmCC','base64');
test.skip(process.env.TAP_WRAP_CONTRACT_GIFT_SHOPPING !== 'true', 'Requires the explicit disposable shopping fixture.');
test.beforeEach(async ({ context, page }) => {
  await context.route('**/*', route => {
    const url = new URL(route.request().url());
    return ['127.0.0.1','localhost'].includes(url.hostname) || ['blob:','data:'].includes(url.protocol) ? route.continue() : route.abort();
  });
  const errors = []; page.on('pageerror', error => errors.push(error.message));
  page.on('close', () => expect(errors).toEqual([]));
});
async function build(page, box, photo = null) {
  await page.getByRole('button',{name:`Choose Synthetic ${box}`,exact:true}).click();
  await page.getByRole('button',{name:'Fill With Flowers',exact:true}).click();
  await page.getByRole('button',{name:'Add Synthetic rose-red',exact:true}).click();
  if (photo) {
    await page.getByRole('button',{name:'Make It Personal',exact:true}).click();
    await page.locator('.gb-personal-section').first().locator('summary').click();
    await page.getByLabel('Choose your photos').setInputFiles({name:photo,mimeType:'image/png',buffer:png});
  }
  await page.getByRole('button',{name:'Finishing Touches',exact:true}).click();
  await page.getByRole('button',{name:'Choose Synthetic ribbon-navy',exact:true}).click();
  await page.getByRole('button',{name:'Next: Review',exact:true}).click();
  await expect(page.getByRole('button',{name:/^Add (?:Your Gift to Cart|to Cart)$/})).toBeEnabled();
}
async function add(page) {
  await page.getByRole('button',{name:/^Add (?:Your Gift to Cart|to Cart)$/}).click();
  await expect(page).toHaveURL(/\/cart$/);
}
async function cart(context) { return (await (await context.request.get(`${api}/commerce/cart`)).json()).data.cart; }

for (const [navigation, firstPhoto, secondPhoto] of [
  ['fresh',null,null], ['back','first.png',null], ['fresh','first.png','second.png'], ['back','same.png','same.png'],
]) test(`sequential distinct gifts: ${navigation}, ${firstPhoto || 'plain'} / ${secondPhoto || 'plain'}`,async ({page,context}) => {
  await page.goto('/customize/gift-box'); await build(page,'box-2',firstPhoto); await add(page);
  if (navigation === 'back') await page.goBack(); else await page.goto('/customize/gift-box');
  await build(page,'box-3',secondPhoto);
  if (!firstPhoto) {
    let reject = true;
    await page.route('**/api/v1/commerce/cart/items',route=>{
      if (route.request().method() !== 'POST' || !reject) return route.continue();
      reject = false;
      return route.fulfill({status:409,json:{ok:false,error:{code:'GIFT_BOX_COMPONENT_UNAVAILABLE',message:'This component is unavailable. Choose another item or try again.'}}});
    });
    await page.getByRole('button',{name:'Add Your Gift to Cart'}).click();
    await expect(page.locator('.gb-announcement')).toContainText('Choose another item');
    expect((await cart(context)).items).toHaveLength(1);
  }
  await add(page);
  const result = await cart(context);
  expect(result.items).toHaveLength(2); expect(result.items.every(line=>line.valid)).toBe(true);
  expect(result.items.map(line=>line.giftBox.box.componentId)).toEqual(['box-2','box-3']);
  expect(result.items.map(line=>line.quantity)).toEqual([1,1]);
  expect(result.items.map(line=>line.giftBox.personalization?.photoCount || 0)).toEqual([firstPhoto ? 1 : 0,secondPhoto ? 1 : 0]);
  if (navigation === 'fresh' && secondPhoto === 'second.png') {
    await page.getByRole('link',{name:'Proceed to Checkout',exact:true}).click();
    await page.getByLabel('Full name', {exact:true}).fill('Synthetic gift buyer');
    await page.getByLabel('Email', {exact:true}).fill('gift-buyer@example.test');
    await page.getByLabel('Egyptian mobile number').fill('01012345678');
    await page.getByLabel('Governorate', {exact:true}).selectOption('cairo');
    await page.getByLabel('Delivery address', {exact:true}).fill('10 Synthetic Gift Test Street');
    await expect(page.getByRole('radio',{name:/Cash on Delivery/})).toHaveCount(0);
    await expect(page.getByRole('button',{name:'Place Order',exact:true})).toBeEnabled();
    await page.getByRole('button',{name:'Place Order',exact:true}).click();
    await expect(page).toHaveURL(/\/orders\/[a-f0-9]{24}$/);
    const orderId = page.url().split('/').pop();
    await page.goto('/login');
    await page.getByLabel('Email Address').fill('admin@connected.example.test');
    await page.getByLabel('Password',{exact:true}).fill('isolated-fixture-password');
    await page.getByRole('button',{name:'Log In',exact:true}).click();
    await expect(page).not.toHaveURL(/\/login/);
    await page.goto(`/admin/commerce/orders/${orderId}`);
    const designs=page.getByRole('region',{name:"Customer's Gift Design"});
    await expect(designs).toHaveCount(2);
    for (const design of await designs.all()) {
      await expect(design.locator('.gb-free-photo img')).toHaveCount(0);
      await design.getByRole('button',{name:'View private photos in design'}).click();
      await expect(design.locator('.gb-free-photo img')).toHaveCount(1);
      await expect.poll(()=>design.locator('.gb-free-photo img').evaluate(img=>img.complete&&img.naturalWidth>0)).toBe(true);
    }
  }
});

test('a lost add response retries the same personalized operation without another quote or duplicate',async ({page,context}) => {
  await page.goto('/customize/gift-box'); await build(page,'box-2','retry.png');
  let lost = false;
  await page.route('**/api/v1/commerce/cart/items',async route => {
    if (route.request().method() !== 'POST' || lost) return route.continue();
    const response = await route.fetch(); expect(response.status()).toBe(201);
    lost = true; await route.abort('failed');
  });
  await page.getByRole('button',{name:/^Add (?:Your Gift to Cart|to Cart)$/}).click();
  await expect(page.locator('.gb-announcement')).not.toBeEmpty();
  await expect.poll(async()=> (await cart(context)).items.length).toBe(1);
  await add(page);
  const result = await cart(context); expect(result.items).toHaveLength(1); expect(result.items[0].quantity).toBe(1);
});

test('identical plain gifts intentionally added from fresh visits increase quantity',async ({page,context}) => {
  for (let index=0;index<2;index++) {
    await page.goto('/customize/gift-box'); await build(page,'box-2'); await add(page);
  }
  const result=await cart(context);
  expect(result.items).toHaveLength(1); expect(result.items[0].quantity).toBe(2);
});

test('editing after a lost add response uses fresh photo receipts and preserves the committed gift',async ({page,context}) => {
  await page.goto('/customize/gift-box'); await build(page,'box-2','changed.png');
  let lost=false;
  await page.route('**/api/v1/commerce/cart/items',async route=>{
    if (route.request().method() !== 'POST' || lost) return route.continue();
    const response=await route.fetch(); expect(response.status()).toBe(201);
    lost=true; await route.abort('failed');
  });
  await page.getByRole('button',{name:'Add Your Gift to Cart'}).click();
  await expect.poll(async()=> (await cart(context)).items.length).toBe(1);
  await page.getByRole('button',{name:'Fill With Flowers',exact:true}).click();
  await page.getByRole('button',{name:'Add Synthetic rose-red',exact:true}).click();
  await page.getByRole('button',{name:'Finishing Touches',exact:true}).click();
  await page.getByRole('button',{name:'Next: Review',exact:true}).click();
  await add(page);
  const result=await cart(context);
  expect(result.items).toHaveLength(2);
  expect(result.items.map(line=>line.giftBox.personalization.photoCount)).toEqual([1,1]);
  expect(result.items.every(line=>line.valid)).toBe(true);
});
