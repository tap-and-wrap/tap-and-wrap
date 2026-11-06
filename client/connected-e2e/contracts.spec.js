import { chooseOption } from '../e2e/select-option.js';
import { chooseImageFiles } from '../e2e/media-helpers.js';
import { test, expect } from '@playwright/test';

const api = 'http://127.0.0.1:' + (process.env.TAP_WRAP_CONTRACT_API_PORT || 4092);
const image = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAIAAACQd1PeAAAACXBIWXMAAAPoAAAD6AG1e1JrAAAADElEQVQImWO4NbsXAARVAgOYIL6CAAAAAElFTkSuQmCC', 'base64');
test.beforeEach(async ({ context }) => {
  // API responses are never intercepted. Prevent any third-party font/asset call.
  await context.route('**/*', route => {
    const address = new URL(route.request().url());
    return ['127.0.0.1', 'localhost'].includes(address.hostname) || ['data:', 'blob:'].includes(address.protocol) ? route.continue() : route.abort();
  });
});
async function fixtureState(request) {
  const response = await request.get(`${api}/__fixture/state`, { headers: { 'x-fixture-key': 'connected-fixture-only' } });
  expect(response.ok()).toBeTruthy(); return response.json();
}
async function login(page, name, destination = '/my-orders') {
  destination = destination.replace('/admin/commerce/orders', '/admin/orders');
  await page.goto(`/login?returnTo=${encodeURIComponent(destination)}`);
  await page.getByLabel('Email Address').fill(`${name}@connected.example.test`);
  await page.getByLabel('Password', { exact: true }).fill('isolated-fixture-password');
  await page.getByRole('button', { name: 'Log In', exact: true }).click();
  await expect(page).toHaveURL(destination);
}
async function csrfHeaders(context) {
  const response = await context.request.get(`${api}/api/v1/auth/csrf`);
  expect(response.ok()).toBeTruthy();
  const value = await response.json();
  return { Origin: 'http://127.0.0.1:' + (process.env.TAP_WRAP_CONTRACT_WEB_PORT || 5192), 'x-csrf-token': value.data.csrfToken };
}

test('real ordinary product personalization uploads once and preserves fixed-price cart snapshots while checkout stays disabled', async ({page,request,context})=>{
 const errors=[],signed=[];page.on('pageerror',e=>errors.push(e.message));page.on('request',r=>{if(r.method()==='POST'&&r.url().endsWith('/commerce/uploads/sign'))signed.push(r.postDataJSON());});
 await page.goto('/products/connected-personalized-product');await page.getByRole('button',{name:'Customize This',exact:true}).click();
 await chooseImageFiles(page,page,'Audit photo',{name:'fixture.png',mimeType:'image/png',buffer:image});expect(signed).toHaveLength(0);
 await page.getByRole('button',{name:'Save personalization',exact:true}).click();const before=await fixtureState(request);
 await page.getByRole('button',{name:'Add to Cart',exact:true}).click();await expect(page.locator('[data-sonner-toast]').filter({hasText:'Added to your cart.'})).toBeVisible();
 expect(signed).toHaveLength(1);expect(signed[0].fieldKey).toBe('photo');const after=await fixtureState(request);expect(after.puts-before.puts).toBe(1);expect(after.uploads.length-before.uploads.length).toBe(1);
 const cart=(await(await context.request.get(api+'/api/v1/commerce/cart')).json()).data.cart;expect(cart.items).toHaveLength(1);const line=cart.items[0];expect(line.unitPricePiastres).toBe(10000);expect(line.personalization.photo).toHaveLength(1);expect(after.uploads.find(u=>u._id===line.personalization.photo[0]).cartId).toBeTruthy();
 await page.goto('/cart');await chooseOption(page.getByRole('combobox',{name:'Quantity',exact:true}), '2');await expect.poll(async()=>(await(await context.request.get(api+'/api/v1/commerce/cart')).json()).data.cart.subtotalPiastres).toBe(20000);
 await page.goto('/checkout');await expect(page.getByRole('heading',{name:'Ordering is not enabled yet'})).toBeVisible();await expect(page.getByRole('button',{name:'Place Order'})).toHaveCount(0);
 const rejected=await context.request.post(api+'/api/v1/commerce/checkout/quote',{headers:await csrfHeaders(context),data:{checkoutKey:crypto.randomUUID(),paymentMethod:'cod',governorate:'cairo'}});expect(rejected.status()).toBe(403);expect((await rejected.json()).error.code).toBe('CHECKOUT_DISABLED');expect((await fixtureState(request)).orderCount).toBe(before.orderCount);expect(errors).toEqual([]);
});





test('real customer/order pages never render admin notes and reject another customer order', async ({ page, context }) => {
  await login(page, 'alice');
  await page.getByRole('link', { name: /234567/ }).click();
  await expect(page.getByRole('heading', { name: 'Order #234567' })).toBeVisible();
  await expect(page.getByText('Approved customer explanation')).toBeVisible();
  await expect(page.getByText(/PRIVATE_.*OPERATIONAL_NOTE/)).toHaveCount(0);
  const alicePath = new URL(page.url()).pathname;
  const customerOrder = await context.request.get(`${api}/api/v1/commerce${alicePath}`);
  expect(customerOrder.status()).toBe(200);
  expect(JSON.stringify(await customerOrder.json())).not.toContain('PRIVATE_OPERATIONAL_NOTE');
  await login(page, 'bob');
  await expect(page.getByRole('link', { name: /345678/ })).toBeVisible();
  await expect(page.getByRole('link', { name: /234567/ })).toHaveCount(0);
  expect((await context.request.get(`${api}/api/v1/commerce${alicePath}`)).status()).toBe(404);
  const orderId = alicePath.split('/').at(-1);
  expect((await context.request.get(`${api}/api/v1/admin/commerce/orders/${orderId}`)).status()).toBe(403);
  await login(page, 'admin', `/admin/commerce/orders/${orderId}`);
  await expect(page.getByRole('heading', { name: 'Private operational history' })).toBeVisible();
  await expect(page.getByText('PRIVATE_OPERATIONAL_NOTE', { exact: true })).toBeVisible();
});
