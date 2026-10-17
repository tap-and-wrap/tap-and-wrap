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
 await page.getByRole('button',{name:'Add to Cart',exact:true}).click();await expect(page.getByRole('status').filter({hasText:'Added to your cart.'})).toBeVisible();
 expect(signed).toHaveLength(1);expect(signed[0].fieldKey).toBe('photo');const after=await fixtureState(request);expect(after.puts-before.puts).toBe(1);expect(after.uploads.length-before.uploads.length).toBe(1);
 const cart=(await(await context.request.get(api+'/api/v1/commerce/cart')).json()).data.cart;expect(cart.items).toHaveLength(1);const line=cart.items[0];expect(line.unitPricePiastres).toBe(10000);expect(line.personalization.photo).toHaveLength(1);expect(after.uploads.find(u=>u._id===line.personalization.photo[0]).cartId).toBeTruthy();
 await page.goto('/cart');await page.getByRole('combobox',{name:'Quantity',exact:true}).selectOption('2');await expect.poll(async()=>(await(await context.request.get(api+'/api/v1/commerce/cart')).json()).data.cart.subtotalPiastres).toBe(20000);
 await page.goto('/checkout');await expect(page.getByRole('heading',{name:'Ordering is not enabled yet'})).toBeVisible();await expect(page.getByRole('button',{name:'Place Order'})).toHaveCount(0);
 const rejected=await context.request.post(api+'/api/v1/commerce/checkout/quote',{headers:await csrfHeaders(context),data:{checkoutKey:crypto.randomUUID(),paymentMethod:'cod',governorate:'cairo'}});expect(rejected.status()).toBe(403);expect((await rejected.json()).error.code).toBe('CHECKOUT_DISABLED');expect((await fixtureState(request)).orderCount).toBe(before.orderCount);expect(errors).toEqual([]);
});

test('real admin configuration form creates supported options and persists exact piastres/revisions', async ({ page, context }) => {
  await login(page, 'admin', '/admin/commerce/templates');
  await page.getByRole('button', { name: 'Add template', exact: true }).click();
  await page.getByLabel('Template name', { exact: true }).fill('Connected edited gift box');
  await page.getByLabel('Stable key', { exact: true }).fill('connected-edited-box');
  await page.getByLabel('Service / configuration type').selectOption('gift_box');
  await page.getByRole('button', { name: 'Add component group', exact: true }).click();
  await page.getByLabel('Group key', { exact: true }).fill('extras');
  await page.getByLabel('Group label', { exact: true }).fill('Fixture extras');
  await page.getByRole('button', { name: 'Add component option', exact: true }).click();
  await page.getByLabel('Option key', { exact: true }).fill('card');
  await page.getByLabel('Option label', { exact: true }).fill('Fixture card');
  await page.getByLabel('Additional price adjustment (EGP)', { exact: true }).fill('0.03');
  await page.getByRole('button', { name: 'Add requirement field', exact: true }).click();
  await page.getByLabel('Field key', { exact: true }).fill('gift-message');
  await page.getByLabel('Customer-facing label', { exact: true }).fill('Gift message');
  const creating = page.waitForResponse(response => response.url().endsWith('/admin/commerce/templates') && response.request().method() === 'POST');
  await page.getByRole('button', { name: 'Save configuration', exact: true }).click();
  const response = await creating;
  expect(response.status()).toBe(201);
  const saved = (await response.json()).data.template;
  expect(saved.groups[0].options[0].priceAdjustmentPiastres).toBe(3);
  expect(saved.groups[0].options[0].available).toBeUndefined();
  expect(saved.fields[0].key).toBe('gift-message');
  expect(saved.revision).toBe(0);
  await expect(page.getByText('Configuration saved.')).toBeVisible();
  await page.getByLabel('Template name', { exact: true }).fill('Connected edited gift box revised');
  const updating = page.waitForResponse(response => response.url().endsWith(`/admin/commerce/templates/${saved._id}`) && response.request().method() === 'PATCH');
  await page.getByRole('button', { name: 'Save configuration', exact: true }).click();
  const edited = await updating;
  expect(edited.status()).toBe(200);
  expect((await edited.json()).data.template.revision).toBe(1);
  const invalid = await context.request.patch(`${api}/api/v1/admin/commerce/templates/${saved._id}`, { headers: await csrfHeaders(context), data: { expectedRevision: 1, groups: [{ ...saved.groups[0], options: [{ ...saved.groups[0].options[0], available: true }] }] } });
  expect(invalid.status()).toBe(400);
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

test('real component form searches paginated main/subcategories and preserves their relationships', async ({ page }) => {
  await login(page, 'admin', '/admin/commerce/components');
  await page.getByRole('button', { name: 'Add component', exact: true }).click();
  await page.getByLabel('Component name', { exact: true }).fill('Connected unapproved component');
  await page.getByLabel('Unique slug', { exact: true }).fill('connected-unapproved-component');
  await page.getByLabel('Find main category', { exact: true }).fill('Connected Fixture');
  const matchingCategory = (response, parent, search) => {
    const url = new URL(response.url());
    return url.pathname.endsWith('/admin/categories') && url.searchParams.get('parent') === parent && url.searchParams.get('search') === search;
  };
  const mainSearch = page.waitForResponse(response => matchingCategory(response, 'root', 'Connected Fixture'));
  await page.getByRole('button', { name: 'Find categories', exact: true }).first().click();
  const mainResponse = await mainSearch;
  expect(mainResponse.status()).toBe(200);
  expect(new URL(mainResponse.url()).searchParams.get('limit')).toBe('20');
  expect(new URL(mainResponse.url()).searchParams.get('page')).toBe('1');
  const mainData = (await mainResponse.json()).data;
  expect(mainData.pagination.limit).toBe(20);
  expect(mainData.categories).toHaveLength(1);
  expect(mainData.categories[0].parentId).toBeNull();
  await page.getByRole('combobox', { name: 'Main category', exact: true }).selectOption(mainData.categories[0]._id);
  await page.getByLabel('Find subcategory (optional)', { exact: true }).fill('Fixture Child');
  const childSearch = page.waitForResponse(response => matchingCategory(response, 'connected-fixture-category', 'Fixture Child'));
  await page.getByRole('button', { name: 'Find categories', exact: true }).nth(1).click();
  const childResponse = await childSearch;
  expect(childResponse.status()).toBe(200);
  const childData = (await childResponse.json()).data;
  expect(childData.pagination.limit).toBe(20);
  expect(childData.categories).toHaveLength(1);
  expect(childData.categories[0].parentId).toBe(mainData.categories[0]._id);
  await page.getByRole('combobox', { name: 'Subcategory (optional)', exact: true }).selectOption(childData.categories[0]._id);
  await expect(page.getByRole('region', { name: 'Component images', exact: true }).getByRole('button', { name: 'Add images', exact: true })).toBeVisible();
  await chooseImageFiles(page, page.getByRole('region', { name: 'Component images', exact: true }), 'Add images', { name: 'synthetic-component.png', mimeType: 'image/png', buffer: image });
  await page.getByRole('button', { name: 'Upload selected images', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Save configuration', exact: true })).toBeEnabled();
  const creating = page.waitForResponse(response => response.url().endsWith('/admin/commerce/components') && response.request().method() === 'POST');
  await page.getByRole('button', { name: 'Save configuration', exact: true }).click();
  const created = await creating;
  expect(created.status()).toBe(201);
  const component = (await created.json()).data.component;
  expect(component.categoryId).toBe(mainData.categories[0]._id);
  expect(component.subcategoryId).toBe(childData.categories[0]._id);
  expect(component.revision).toBe(0);
  expect(component.priceApproved).toBe(false);
  expect(component.configurationApproved).toBe(false);
  expect(component.inventory.approved).toBe(false);
  expect(component.inventory.quantity).toBe(10); // Existing provisional default, explicitly NOT approved stock.
  expect(component.galleryKeys).toHaveLength(1);
  expect(component.galleryKeys[0]).toMatch(/^catalog-media\/v1\/[a-f0-9]{64}\.png$/);
  const options = await page.request.get(`${api}/api/v1/commerce/service-requests/options/gift_box`);
  expect((await options.json()).data.components.some(option => option.componentId === component._id)).toBe(false);
  await expect(page.getByText('Configuration saved.')).toBeVisible();
});
