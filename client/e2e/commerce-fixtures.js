import { expect } from '@playwright/test';
import { blockExternalRequests } from './network-fixture.js';
import { evaluateCustomization, publicTemplatePresentation } from '../../server/src/commerce/customization.js';

export const commerceProduct = {
  _id: '710000000000000000000001', name: 'Isolated Commerce Gift', slug: 'isolated-commerce-gift', description: 'An isolated automated-test product.',
  category: { _id: '710000000000000000000010', name: 'Test Gifts', slug: 'test-gifts', active: true, parentId: null }, subcategory: null,
  mainImageUrl: 'https://media.example.test/commerce-gift.png', galleryUrls: ['https://media.example.test/commerce-gift.png'],
  pricePiastres: 25000, compareAtPiastres: null, priceApproved: true, inventory: { mode: 'tracked', quantity: 10, available: true, approved: true },
  orderingAvailable: true, requiresOptions: false, isBestSeller: false, variants: [], personalization: { fields: [] }, customization: { enabled: false },
};
export const commerceTemplate = {
  _id: '710000000000000000000020', key: 'isolated-gift-box', name: 'Isolated Gift Box', kind: 'gift_box', version: 1, active: true, status: 'approved', pricingMode: 'additive', baseAdjustmentPiastres: 0,
  groups: [{ key: 'extras', label: 'Approved extras', minChoices: 1, maxChoices: 2, allowedActions: ['add', 'remove', 'replace'], options: [
    { key: 'card', label: 'Configured Card', componentId: '710000000000000000000030', active: true, priceAdjustmentPiastres: 0, minQuantity: 1, maxQuantity: 2, defaultQuantity: 0 },
    { key: 'unavailable', label: 'Unavailable Extra', componentId: null, active: false, priceAdjustmentPiastres: 1000, minQuantity: 1, maxQuantity: 1, defaultQuantity: 0 },
  ] }], fields: [], engraving: {},
};
export const commerceOrder = {
  id: '710000000000000000000040', _id: '710000000000000000000040', orderNumber: '681243', revision: 1,
  customer: { name: 'Isolated Customer', email: 'isolated@example.test', phone: '01012345678', governorate: 'cairo', address: 'Isolated test delivery address', notes: '' },
  lines: [{ productId: commerceProduct._id, name: commerceProduct.name, slug: commerceProduct.slug, quantity: 1, unitPricePiastres: 25000, lineTotalPiastres: 25000, personalization: {}, customization: null }],
  totals: { subtotalPiastres: 25000, discountPiastres: 0, shippingPiastres: 9000, totalPiastres: 34000, applied: [] },
  paymentMethod: 'cod', paymentState: 'unpaid', fulfillmentState: 'received', canCancel: true, history: [{ at: '2026-10-08T12:00:00.000Z', event: 'order_received' }],
  createdAt: '2026-10-08T12:00:00.000Z', updatedAt: '2026-10-08T12:00:00.000Z', proofAvailable: false, files: [],
};
const blankCart = () => ({ items: [], subtotalPiastres: 0, quantity: 0 });
const pagination = (total, page = 1) => ({ page, limit: 20, total, pages: Math.max(1, Math.ceil(total / 20)), totalPages: Math.max(1, Math.ceil(total / 20)) });
const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jPh0AAAAASUVORK5CYII=', 'base64');
const fixtureComponents = [{ _id: '710000000000000000000030', name: 'Configured Card', enabledForCustomization: true, configurationApproved: true, priceApproved: true, pricePiastres: 5000, reviewRequired: false, inventory: { mode: 'tracked', quantity: 10, approved: true, available: true } }];

export async function mockCommerce(page, options = {}) {
  await blockExternalRequests(page);
  await page.route(/https:\/\/(?:fonts\.googleapis\.com|fonts\.gstatic\.com)\//, (route) => route.abort());
  const product = structuredClone(options.product || commerceProduct);
  const template = structuredClone(options.template || commerceTemplate);
  const calls = [];
  const uploads = [];
  const orders = [];
  const state = { cart: structuredClone(options.cart || blankCart()), user: options.role ? { id: '710000000000000000000050', _id: '710000000000000000000050', name: 'Isolated Admin', email: 'isolated@example.test', role: options.role } : null, template, order: structuredClone(options.order || commerceOrder) };
  state.component = structuredClone(options.component || { _id: '710000000000000000000030', name: 'Configured Card', revision: 0, pricePiastres: 5000, priceApproved: false, configurationApproved: false, enabledForCustomization: false, inventory: { mode: 'tracked', quantity: 10, approved: false, available: true } });
  state.bundle = options.bundle ? structuredClone(options.bundle) : null;
  state.discount = options.discount ? structuredClone(options.discount) : null;
  state.shipping = { _id: '710000000000000000000070', key: 'shipping', revision: 1, updatedAt: '2026-10-08T12:00:00.000Z', cairoGizaPiastres: 9000, otherGovernoratesPiastres: 12000, approved: false };
  product.revision ??= 0;
  const headers = { 'access-control-allow-origin': 'http://127.0.0.1:5191', 'access-control-allow-credentials': 'true', 'access-control-allow-headers': 'content-type,x-csrf-token,x-tracking-consent,x-search-event-id', 'access-control-allow-methods': 'GET,POST,PATCH,PUT,DELETE,OPTIONS', vary: 'Origin' };
  const success = (route, data, status = 200) => route.fulfill({ status, headers, contentType: 'application/json', body: JSON.stringify({ ok: true, data }) });
  const failure = (route, message, status = 400) => route.fulfill({ status, headers, contentType: 'application/json', body: JSON.stringify({ ok: false, error: { message, code: 'ISOLATED_FIXTURE_ERROR' } }) });
  const conflict = (route) => route.fulfill({ status: 409, headers, json: { ok: false, error: { code: 'EDIT_CONFLICT', message: 'This record changed after you opened it. Your changes were not saved.' } } });
  function recalculate() {
    state.cart.quantity = state.cart.items.reduce((sum, item) => sum + item.quantity, 0);
    state.cart.subtotalPiastres = state.cart.items.reduce((sum, item) => sum + item.lineTotalPiastres, 0);
  }
  await page.route('https://media.example.test/**', (route) => route.fulfill({ status: 200, contentType: 'image/png', body: png }));
  await page.route('https://private-upload.example.test/**', async (route) => { if (route.request().method() === 'OPTIONS') return route.fulfill({ status: 204, headers }); calls.push({ method: 'PUT', path: '/direct-upload', body: null }); return route.fulfill({ status: options.failDirectUpload ? 500 : 200, headers, body: '' }); });
  await page.route('**/api/v1/**', async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    const path = url.pathname.replace(/^\/api\/v1/, '').replace(/^\/public(?=\/)/, '');
    const method = request.method();
    if (method === 'OPTIONS') return route.fulfill({ status: 204, headers });
    const payload = ['POST', 'PATCH', 'PUT'].includes(method) ? request.postDataJSON() : null;
    calls.push({ method, path, body: payload, query: Object.fromEntries(url.searchParams) });
    if (path === '/tracking/config') return success(route, { enabled: false, consent: false });
    if (path === '/site-content') return success(route, { about: null, contact: null, policies: {}, faq: [], featuredReviews: [] });
    if (path === '/bundles') return success(route, { bundles: [] });
    if (/^\/products\/[^/]+\/reviews$/.test(path)) return success(route, { reviews: [], pagination: pagination(0) });
    if (path === '/auth/account-status') return success(route, { emailVerified: false, emailDeliveryConfigured: false });
    if (path === '/auth/csrf') return success(route, { csrfToken: 'isolated-csrf' });
    if (['/auth/me', '/auth/session'].includes(path)) return success(route, { user: state.user });
    if (path === '/auth/login') { state.user = { id: '710000000000000000000050', name: 'Isolated Customer', role: 'customer', email: payload.email }; return success(route, { user: state.user }); }
    if (path === '/auth/logout') { state.user = null; state.cart = blankCart(); return success(route, {}); }
    if (path === '/admin/ping') return state.user?.role === 'admin' ? success(route, { authorized: true }) : failure(route, 'Administrator access required.', 403);
    if (path === '/commerce/cart' && method === 'GET') return options.failCartRefreshAfterOrder && orders.length ? failure(route, 'Synthetic cart refresh outage.', 503) : success(route, { cart: state.cart, checkoutEnabled: options.checkoutEnabled === true, checkoutOwnerKey: state.user ? '1'.repeat(64) : (options.guestOwnerKey || '0'.repeat(64)) });
    if (path === '/commerce/cart' && method === 'DELETE') { state.cart = blankCart(); return success(route, { cart: state.cart }); }
    if (path === '/commerce/cart/merge') return success(route, { cart: state.cart });
    if (path === '/commerce/cart/items' && method === 'POST') {
      if (options.rejectAdd) return failure(route, 'This product is no longer available.', 409);
      const signature = JSON.stringify([payload.productId, payload.variantKey, payload.personalization, payload.customization]);
      let item = state.cart.items.find((entry) => entry.signature === signature);
      const unitPrice = payload.customization ? 30000 : product.pricePiastres;
      if (item) item.quantity += payload.quantity;
      else { item = { id: `line-${state.cart.items.length + 1}`, signature, productId: payload.productId, slug: product.slug, name: product.name, mainImageUrl: product.mainImageUrl, variantKey: payload.variantKey || null, quantity: payload.quantity, personalization: payload.personalization || {}, customization: payload.customization || null, unitPricePiastres: unitPrice, valid: true }; state.cart.items.push(item); }
      item.lineTotalPiastres = item.quantity * item.unitPricePiastres; recalculate();
      return success(route, { cart: state.cart });
    }
    if (/^\/commerce\/cart\/items\//.test(path)) {
      const id = path.split('/').at(-1);
      if (method === 'DELETE') state.cart.items = state.cart.items.filter((item) => item.id !== id);
      if (method === 'PATCH') { const item = state.cart.items.find((entry) => entry.id === id); item.quantity = payload.quantity; item.lineTotalPiastres = item.quantity * item.unitPricePiastres; }
      recalculate(); return success(route, { cart: state.cart });
    }
    if (path === '/commerce/uploads/sign') {
      if (options.storageUnavailable) return failure(route, 'Private storage is not configured. No file was uploaded.', 503);
      const id = `710000000000000000000${String(100 + uploads.length).padStart(3, '0')}`;
      uploads.push({ id, ...payload });
      return success(route, { upload: { id }, uploadUrl: `https://private-upload.example.test/${id}`, headers: { 'Content-Type': payload.mimeType } });
    }
    if (/^\/commerce\/uploads\/[^/]+\/complete$/.test(path)) return options.failComplete ? failure(route, 'Upload verification failed.', 400) : success(route, { upload: { id: path.split('/')[3] } });
    if (/^\/commerce\/uploads\/[^/]+$/.test(path) && method === 'DELETE') return success(route, { deleted: true });
    if (/^\/commerce\/customization\/services\//.test(path)) return success(route, { products: [product], pagination: pagination(1) });
    if (/^\/commerce\/customization\/products\//.test(path)) return success(route, { product, template: publicTemplatePresentation(state.template, fixtureComponents) });
    if (path === '/commerce/customization/quote') {
      try {
        const quote = evaluateCustomization(state.template, fixtureComponents, payload.customization, { requireFields: false });
        return success(route, { basePricePiastres: product.pricePiastres, adjustmentPiastres: quote.adjustmentPiastres, unitPricePiastres: product.pricePiastres + quote.adjustmentPiastres });
      } catch (error) { return failure(route, error.message); }
    }
    if (path === '/commerce/checkout/config') return success(route, { enabled: options.checkoutEnabled === true, instaPayNumber: '01060673073', governorates: [{ id: 'cairo', name: 'Cairo', shippingPiastres: 9000 }, { id: 'alexandria', name: 'Alexandria', shippingPiastres: 12000 }] });
    if (path === '/commerce/checkout/quote') {
      expect(payload.checkoutKey).toBeTruthy(); expect(['cod', 'instapay']).toContain(payload.paymentMethod);
      const subtotalPiastres = state.cart.subtotalPiastres; const discountPiastres = payload.discountCode === 'ISOLATED' ? 2500 : 0; const shippingPiastres = payload.governorate === 'cairo' ? 9000 : 12000;
      return success(route, { subtotalPiastres, discountPiastres, shippingPiastres, totalPiastres: subtotalPiastres - discountPiastres + shippingPiastres });
    }
    if (path === '/commerce/orders' && method === 'POST') {
      if (options.rejectOrder) return failure(route, 'Order submission could not be completed. Your cart remains saved.', 503);
      const found = orders.find((order) => order.checkoutKey === payload.checkoutKey);
      if (!found) { state.order = { ...state.order, customer: payload.customer, paymentMethod: payload.paymentMethod, paymentState: payload.paymentMethod === 'instapay' ? 'awaiting_verification' : 'unpaid', checkoutKey: payload.checkoutKey }; orders.push(state.order); state.cart = blankCart(); }
      if (options.loseFirstOrderResponse && !found) return route.abort('failed');
      return success(route, { order: found || state.order });
    }
    if (/^\/commerce\/checkout\/submissions\//.test(path) && method === 'GET') return success(route, { order: orders.find(order => order.checkoutKey === path.split('/').at(-1)) || null, tracking: null });
    if (path === '/commerce/orders' && method === 'GET') return state.user ? success(route, { orders: [state.order], pagination: pagination(1) }) : failure(route, 'Sign in to view your orders.', 401);
    if (path === '/commerce/orders/track') return payload.orderNumber === state.order.orderNumber && payload.phone === state.order.customer.phone ? success(route, { order: { orderNumber: state.order.orderNumber, fulfillmentState: state.order.fulfillmentState, paymentState: state.order.paymentState } }) : failure(route, 'No matching order was found.', 404);
    if (/^\/commerce\/orders\/[^/]+\/cancel$/.test(path)) { expect(payload.revision).toBe(state.order.revision); state.order.fulfillmentState = 'cancelled'; state.order.canCancel = false; state.order.revision += 1; return success(route, { order: state.order }); }
    if (/^\/commerce\/orders\/[^/]+$/.test(path)) return options.denyOrder ? failure(route, 'Order not found.', 404) : success(route, { order: state.order });
    if (/^\/admin\/commerce\//.test(path) && state.user?.role !== 'admin') return failure(route, 'Administrator access required.', 403);
    if (/^\/admin\/commerce\/orders\/[^/]+\/proof$/.test(path) || /^\/admin\/commerce\/orders\/[^/]+\/files\//.test(path)) return route.fulfill({ status: 200, contentType: 'image/png', body: png, headers: { ...headers, 'cache-control': 'private, no-store' } });
    if (/^\/admin\/commerce\/orders\/[^/]+\/state$/.test(path)) { expect(payload.revision).toBe(state.order.revision); if (payload.paymentState) state.order.paymentState = payload.paymentState; if (payload.fulfillmentState) state.order.fulfillmentState = payload.fulfillmentState; state.order.revision += 1; return success(route, { order: state.order }); }
    if (/^\/admin\/commerce\/orders\/[^/]+$/.test(path)) return success(route, { order: state.order });
    if (path === '/admin/commerce/orders') return success(route, { orders: [state.order], pagination: pagination(1) });
    if (path === '/admin/commerce/shipping') {
      if (method === 'PATCH') {
        expect(Object.keys(payload).sort()).toEqual(['approved', 'cairoGizaPiastres', 'expectedRevision', 'otherGovernoratesPiastres']);
        if (payload.expectedRevision !== state.shipping.revision) return conflict(route);
        const { expectedRevision: _expected, ...patch } = payload;
        Object.assign(state.shipping, patch, { revision: state.shipping.revision + 1 });
        return success(route, { configuration: state.shipping });
      }
      return success(route, { configuration: state.shipping, governorates: [{ id: 'cairo', name: 'Cairo' }, { id: 'giza', name: 'Giza' }] });
    }
    const match = path.match(/^\/admin\/commerce\/(templates|components|bundles|discounts)(?:\/([^/]+))?(?:\/revisions)?$/);
    if (match) {
      const section = match[1]; const key = section.slice(0, -1);
      const initial = state[key];
      if (method === 'GET') return match[2] ? success(route, { [key]: initial }) : success(route, { [section]: initial ? [initial] : [], pagination: pagination(initial ? 1 : 0) });
      if (match[2] && payload.expectedRevision !== (initial?.revision ?? 0)) return conflict(route);
      const { expectedRevision: _expected, ...patch } = payload;
      const record = { ...initial, _id: match[2] || '710000000000000000000060', version: 1, ...patch, revision: match[2] ? (payload.expectedRevision ?? 0) + 1 : 0 };
      state[key] = record;
      return success(route, { [key]: record, revisionCreated: false }, method === 'POST' ? 201 : 200);
    }
    if (/^\/admin\/commerce\/products\/[^/]+\/configuration$/.test(path)) {
      if (payload.expectedRevision !== product.revision) return conflict(route);
      const { expectedRevision: _expected, ...patch } = payload;
      Object.assign(product, patch, { revision: product.revision + 1 });
      return success(route, { product });
    }
    if (path === '/admin/products') return success(route, { products: [product], pagination: pagination(1) });
    if (/^\/admin\/products\/[^/]+$/.test(path)) return success(route, { product });
    if (path === '/products') return success(route, { products: [product], pagination: pagination(1), total: 1, priceBounds: { minimumPiastres: 0, maximumPiastres: 100000 } });
    if (/^\/products\//.test(path)) return success(route, { product, relatedProducts: [] });
    if (['/categories', '/admin/categories'].includes(path)) return success(route, { categories: [product.category], pagination: pagination(1) });
    if (['/catalog/homepage', '/homepage'].includes(path)) return success(route, { categories: [], bestSellers: [] });
    return failure(route, `Isolated fixture does not implement ${method} ${path}.`, 404);
  });
  return { calls, uploads, orders, state, product, template };
}

export function cartWithProduct(product = commerceProduct) {
  return { items: [{ id: 'line-1', productId: product._id, slug: product.slug, name: product.name, mainImageUrl: product.mainImageUrl, quantity: 1, personalization: {}, customization: null, unitPricePiastres: product.pricePiastres, lineTotalPiastres: product.pricePiastres, valid: true }], subtotalPiastres: product.pricePiastres, quantity: 1 };
}

export async function fillCheckout(page) {
  await page.getByLabel('Full name', { exact: true }).fill('Isolated Customer');
  await page.getByLabel('Email', { exact: true }).fill('isolated@example.test');
  await page.getByLabel('Egyptian mobile number').fill('01012345678');
  await page.getByRole('combobox', { name: /^Governorate/ }).selectOption('cairo');
  await page.getByLabel('Delivery address', { exact: true }).fill('Isolated test delivery address');
  await expect(page.getByRole('button', { name: 'Place Order', exact: true })).toBeEnabled();
}

export const isolatedImageFile = (name = 'isolated-photo.png') => ({ name, mimeType: 'image/png', buffer: png });
