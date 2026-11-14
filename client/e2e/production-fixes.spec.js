import {test,expect} from '@playwright/test';
import {mockCommerce,cartWithProduct,fillCheckout,isolatedImageFile} from './commerce-fixtures.js';
import {mockCatalog} from './catalog-fixtures.js';
import {ASSET_VERSION} from '../../shared/gift-box/definitions.mjs';

const headers={'Access-Control-Allow-Origin':'http://127.0.0.1:5191','Access-Control-Allow-Credentials':'true'};
export function photoGift() {
  const cart=cartWithProduct();Object.assign(cart.items[0],{kind:'gift_box_v2',giftBox:{box:{componentId:'box-2',displayName:'Gift Box'},items:[],artwork:{assetVersion:ASSET_VERSION},design:{presentationVersion:'gift-box-presentation-v2',placements:[],photos:[{x:.34,y:.40,width:.16,height:.20,zone:'inside'},{x:.55,y:.44,width:.12,height:.18,zone:'inside'}]},personalization:{photoCount:2}}});return cart;
}
for(const width of [320,390,768,1024,1440])test(`private photos stay inside main cart arrangement at ${width}`,async({page},info)=>{
  await page.setViewportSize({width,height:900});await mockCommerce(page,{cart:photoGift()});
  let requests=0;await page.route('**/commerce/cart/items/*/gift-photos/*',async route=>{requests++;return route.request().url().endsWith('/0')?route.fulfill({headers,body:isolatedImageFile().buffer,contentType:'image/png'}):route.fulfill({headers,status:404,json:{error:{message:'Unavailable'}}});});
  await page.goto('/cart');
  const thumbnail=page.locator('.cart-v2-photo');
  await expect(thumbnail.getByRole('img',{name:'Photo 1',exact:true})).toBeVisible();
  await expect(thumbnail.getByRole('img',{name:'Photo 2 unavailable',exact:true})).toBeVisible();
  const placed=thumbnail.locator('.gb-free-photo');
  expect(await placed.first().evaluate(node=>[node.style.left,node.style.top,node.style.width,node.style.height])).toEqual(['34%','40%','16%','20%']);
  await page.getByText('View Design Details',{exact:true}).click();
  await expect(page.locator('.private-photo-thumbnail')).toHaveCount(0);
  await expect(page.getByText(/Placement outside the box/)).toHaveCount(0);
  expect(requests).toBe(2);expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
  await page.screenshot({path:info.outputPath(`cart-photos-${width}.png`),fullPage:true});
});

test('rapid editing preserves input focus/caret, empty artwork, layer confirmation and undo',async({page})=>{
  await mockCatalog(page);await page.route('**/fixture-product.png',route=>route.fulfill({body:isolatedImageFile().buffer,contentType:'image/png'}));
  await page.goto('/e2e/fixtures/visual-engraving/index.html');await page.evaluate(()=>window.openApprovedProduct());
  await page.getByRole('button',{name:'Add text',exact:true}).click();
  await expect(page.locator('.ve-layer text')).toHaveCount(0);
  const input=page.getByLabel('Your text',{exact:true});await input.focus();
  await input.pressSequentially('Stable handwriting',{delay:5});
  await expect(input).toHaveValue('Stable handwriting');await expect(input).toBeFocused();
  expect(await input.evaluate(node=>node.selectionStart)).toBe(18);
  await input.fill('');await expect(page.locator('.ve-layer text')).toHaveCount(0);
  await input.fill('A real memory');
  const before=await page.evaluate(()=>window.snapshotEditor().design);
  await page.getByRole('button',{name:'Delete text layer 1',exact:true}).click();
  const dialog=page.getByRole('dialog',{name:'Remove text?',exact:true});await expect(dialog).toBeVisible();
  await dialog.getByRole('button',{name:'Cancel',exact:true}).click();
  expect(await page.evaluate(()=>window.snapshotEditor().design)).toEqual(before);
  await page.getByRole('button',{name:'Delete text layer 1',exact:true}).click();await dialog.getByRole('button',{name:'Remove',exact:true}).click();
  await expect.poll(()=>page.evaluate(()=>window.snapshotEditor().design.layers.length)).toBe(0);await expect(page.getByRole('button',{name:'Add text',exact:true})).toBeFocused();
  await page.getByRole('button',{name:'Undo',exact:true}).click();expect(await page.evaluate(()=>window.snapshotEditor().design)).toEqual(before);
});

test('a verified consumed checkout rotates only its opaque key for a new cart',async({page})=>{
  await mockCommerce(page,{cart:cartWithProduct(),checkoutEnabled:true});
  const seen=[];let first;
  await page.route('**/commerce/checkout/payments/*',route=>{
    const key=route.request().url().split('/').at(-1);first ||= key;
    return route.fulfill({headers,json:{data:{state:key===first?'consumed':null,orderId:key===first?'710000000000000000000080':null,payment:null,quoteSequence:4}}});
  });
  await page.route('**/commerce/checkout/quote',route=>{const body=route.request().postDataJSON();seen.push(body);return route.fulfill({headers,json:{data:{fingerprint:'new-cart',totals:{subtotalPiastres:25000,discountPiastres:0,totalPiastres:25000},quoteSequence:body.quoteSequence}}});});
  await page.goto('/checkout');await expect.poll(()=>seen.length).toBe(1);
  expect(seen[0].checkoutKey).not.toBe(first);expect(seen[0].quoteSequence).toBe(5);
  await expect(page.getByRole('button',{name:'Place Order',exact:true})).toBeEnabled();
});

test('private photo object URLs are revoked when leaving the cart',async({page})=>{
  await page.addInitScript(()=>{const create=URL.createObjectURL.bind(URL),revoke=URL.revokeObjectURL.bind(URL);window.privatePhotoUrls=[];window.revokedPhotoUrls=[];URL.createObjectURL=blob=>{const url=create(blob);window.privatePhotoUrls.push(url);return url;};URL.revokeObjectURL=url=>{window.revokedPhotoUrls.push(url);revoke(url);};});
  await mockCommerce(page,{cart:photoGift()});await page.route('**/commerce/cart/items/*/gift-photos/*',route=>route.fulfill({headers,body:isolatedImageFile().buffer,contentType:'image/png'}));
  await page.goto('/cart');await expect(page.locator('.cart-v2-photo img[alt="Photo 1"]')).toBeVisible();
  await page.getByRole('link',{name:'Continue shopping',exact:true}).click();
  await expect.poll(()=>page.evaluate(()=>window.privatePhotoUrls.every(url=>window.revokedPhotoUrls.includes(url)))).toBe(true);
});

test('every exterior and Box 12 fallback keep square saved sticker coordinates',async({page})=>{
  test.setTimeout(60000);await mockCatalog(page);await page.goto('/e2e/fixtures/sticker-workspace/index.html');
  await page.getByLabel('Write a name, special date, or heartfelt message').fill('Real words');
  for(let box=1;box<=11;box++){
    await page.getByLabel('Fixture selected box').selectOption(`box-${box}`);
    await expect(page.locator('.sticker-viewport')).toBeVisible();
    const bounds=await page.locator('.sticker-viewport').boundingBox();expect(bounds.width).toBeCloseTo(bounds.height,0);expect(bounds.width).toBeLessThanOrEqual(280);
    await page.getByRole('button',{name:'Move sticker left',exact:true}).click();
    expect((await page.evaluate(()=>window.snapshotSticker())).placements[`box-${box}`].version).toBe('box-sticker-workspace-v2');
  }
  await page.getByLabel('Fixture selected box').selectOption('box-12');
  await expect(page.getByText('Real words',{exact:true}).first()).toBeVisible();
  await expect(page.getByText(/Placement outside the box/)).toHaveCount(0);
});


test('a zero-value InstaPay quote shows no transfer destination or screenshot request',async({page})=>{
 await mockCommerce(page,{cart:cartWithProduct(),checkoutEnabled:true});let preparations=0;
 await page.route('**/commerce/checkout/payments/*',route=>route.fulfill({headers,json:{data:{payment:null,state:null,quoteSequence:0}}}));
 await page.route('**/commerce/checkout/quote',route=>route.fulfill({headers,json:{data:{fingerprint:'zero-total',totals:{subtotalPiastres:25000,discountPiastres:25000,totalPiastres:0}}}}));
 await page.route('**/commerce/checkout/payments',route=>{preparations++;return route.fulfill({headers,status:409,json:{error:{code:'NO_TRANSFER_DUE'}}});});
 await page.goto('/checkout');await fillCheckout(page);await page.getByRole('radio',{name:/InstaPay/}).check();
 await expect(page.getByText('No transfer is due for this order.',{exact:true})).toBeVisible();
 await expect(page.getByRole('button',{name:'Place Order',exact:true})).toBeEnabled();
 await expect(page.getByLabel('Transfer sender name *')).toHaveCount(0);expect(preparations).toBe(0);
});
