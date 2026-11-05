import { STICKER_STYLES } from '../../shared/gift-box/sticker-styles.mjs';
import { expect } from '@playwright/test';
import { giftBoxFixture } from './gift-box-fixtures.js';
// Isolated browser journey. All /api/v1 requests are Playwright fixtures;
// no production endpoint, DB, payment provider or real order is contacted.
const headers = {
  'access-control-allow-origin': 'http://127.0.0.1:5191',
  'access-control-allow-credentials': 'true',
  'access-control-allow-headers': 'content-type,x-csrf-token,x-tracking-consent',
  'access-control-allow-methods': 'GET,POST,PATCH,OPTIONS',
};
const reply = (route, data, status = 200) => route.fulfill({ status, headers,
  contentType: 'application/json', body: JSON.stringify({ ok: true, data }) });
const failed = (route, code, message) => route.fulfill({ status: 409, headers,
  contentType: 'application/json', body: JSON.stringify({ ok: false, error: { code, message } }) });
const isOptions = route => route.request().method() === 'OPTIONS';
const ensureLocal = route => expect(new URL(route.request().url()).hostname).toBe('127.0.0.1');

export async function localCheckoutFixture(page, { initialCart, rejectAdd = false, personalized = false } = {}) {
  const fixture = await giftBoxFixture(page, {
    directCommerceEnabled: true, checkoutEnabled: true,
    ...(initialCart ? { cart: initialCart } : {}),
  });
  const options = [
    { optionId:'print',kind:'photo_print',displayName:'Photo print',enabled:true,available:true,boxIds:['box-2'],pricePiastres:2000 },
    { optionId:'sticker',kind:'box_sticker',displayName:'Personalized sticker',enabled:true,available:true,boxIds:['box-2'],pricePiastres:2000,approvedStyleIds:STICKER_STYLES.map(style=>style.id),approvedColorIds:['black','white','red','gold','yellow'] },
  ];
  await page.route('**/api/v1/gift-box/personalization-options', route => reply(route,{options:personalized ? options : [],personalizationCheckoutEnabled:personalized}));
  await page.route('**/api/v1/gift-box/personalization-quote',route => {
    if (isOptions(route)) return route.fulfill({status:204,headers});
    const intent=route.request().postDataJSON().intent;
    return reply(route,{personalization:{...intent,photoPrints:intent.photoPrints.map(photo=>({...photo,pricePiastres:2000})),
      ...(intent.sticker ? {sticker:{...intent.sticker,pricePiastres:2000}} : {}),unitAdjustmentPiastres:(intent.photoPrints.length+(intent.sticker?1:0))*2000,checkoutAuthorized:false,physicallyApproved:false}});
  });
  const audit = { adds: [], quotes: [], orders: [] };
  const savedConfigurations = new Map();
  const lookup = id => fixture.components.find(component => component.componentId === id);
  let created = null;
  await page.route('**/api/v1/commerce/cart/items', async route => {
    ensureLocal(route);
    if (isOptions(route)) return route.fulfill({ status: 204, headers });
    const body = route.request().postDataJSON(); audit.adds.push(body);
    expect(body.kind).toBe('gift_box_v2');
    expect(body.operationKey).toMatch(/^[0-9a-f-]{36}$/i);
    expect(body.quantity).toBe(1);
    expect(JSON.stringify(body)).not.toMatch(/pricePiastres|approvedBy|inventoryQuantity|physicalFitApproved/);
    if (rejectAdd) return failed(route, 'GIFT_BOX_COMPONENT_UNAVAILABLE', 'An approved gift component is no longer available.');
    const { selection } = body.configuration;
    expect(selection.boxId).toBe('box-2');
    const selected = [{ componentId: selection.boxId, quantity: 1 },
      ...selection.items,
      ...(selection.ribbonId ? [{ componentId: selection.ribbonId, quantity: 1 }] : []),
      ...(selection.giftCard ? [{ componentId: selection.giftCard.componentId, quantity: 1 }] : [])];
    const intent = body.configuration.personalizationIntent;
    const extra = intent ? (intent.photoPrints.length + (intent.sticker ? 1 : 0)) * 2000 : 0;
    const amount = extra + selected.reduce((value, item) => {
      const component = lookup(item.componentId);
      expect(component?.availableForEstimate).toBe(true);
      expect(Number.isSafeInteger(component.pricePiastres)).toBe(true);
      return value + component.pricePiastres * item.quantity;
    }, 0);
    const summary = {
      box: { componentId: selection.boxId, displayName: lookup(selection.boxId).displayName },
      items: selection.items.map(item => ({ ...item, category: lookup(item.componentId).category,
        displayName: lookup(item.componentId).displayName })),
      ribbon: selection.ribbonId ? { componentId: selection.ribbonId,
        displayName: lookup(selection.ribbonId).displayName,
        colorHex: lookup(selection.ribbonId).approvedColorHex } : null,
      giftCard: selection.giftCard ? { selected: true, message: selection.giftCard.message } : { selected: false },
      ...(intent ? {personalization:{photoCount:intent.photoPrints.length,sticker:intent.sticker ? {...intent.sticker,pricePiastres:2000} : null,engravings:[],unitAdjustmentPiastres:extra}} : {}),
      artwork: { status: 'available',assetVersion:body.configuration.assetVersion },
      design:{presentationVersion:body.configuration.presentationVersion,placements:body.configuration.placements.map(({componentId,x,y,width,height,zone,layer})=>({componentId,x,y,width,height,zone,layer})),ribbonPlacement:body.configuration.ribbonPlacement,
        photos:(intent?.photoPrints || []).map(({x,y,zone,aspectRatio})=>({x,y,zone,aspectRatio}))},
    };
    const line = { id: '10000000-0000-4000-8000-000000000099', kind: 'gift_box_v2',
      name: 'Build Your Gift Box', quantity: 1, valid: true, checkoutAllowed: true,
      unitPricePiastres: amount, lineTotalPiastres: amount, giftBox: summary };
    savedConfigurations.set(line.id, structuredClone(body.configuration));
    fixture.state.cart.items.push(line);
    fixture.state.cart.quantity = fixture.state.cart.items.reduce((n, item) => n + item.quantity, 0);
    fixture.state.cart.subtotalPiastres = fixture.state.cart.items.reduce((n, item) => n + item.lineTotalPiastres, 0);
    return reply(route, { cart: fixture.state.cart });
  });
  await page.route('**/api/v1/commerce/checkout/quote', async route => {
    ensureLocal(route);
    if (isOptions(route)) return route.fulfill({ status: 204, headers });
    const body = route.request().postDataJSON(); audit.quotes.push(body);
    expect(body.paymentMethod).toBe('instapay');
    expect(body.governorate).toBe('cairo');
    const total = fixture.state.cart.subtotalPiastres;
    return reply(route, { subtotalPiastres: total, discountPiastres: 0,
      shippingPiastres: null, totalPiastres: total, shippingStatus: 'pending_confirmation' });
  });
  // The cart DTO and immutable *order* DTO have different shapes. Emulate the
  // server's public order projection instead of copying a cart summary to an order.
  // The real snapshot and transaction contracts are tested in server/test.
  function presentedOrderLine(line) {
    if (line.kind !== 'gift_box_v2') return structuredClone(line);
    const configuration = savedConfigurations.get(line.id);
    expect(configuration).toBeTruthy();
    const selection = configuration.selection;
    const selected = [
      { componentId: selection.boxId, quantity: 1 },
      ...selection.items,
      ...(selection.ribbonId ? [{ componentId: selection.ribbonId, quantity: 1 }] : []),
      ...(selection.giftCard ? [{ componentId: selection.giftCard.componentId, quantity: 1 }] : []),
    ];
    const components = selected.map(({ componentId, quantity }) => {
      const setting = lookup(componentId);
      expect(setting).toBeTruthy();
      const quantityForLine = quantity * line.quantity;
      return {
        componentId, category: setting.category, displayName: setting.displayName,
        quantityPerBox: quantity, quantityForLine,
        unitPricePiastres: setting.pricePiastres,
        perBoxSubtotalPiastres: setting.pricePiastres * quantity,
        lineSubtotalPiastres: setting.pricePiastres * quantityForLine,
      };
    });
    expect(components.reduce((sum, part) => sum + part.lineSubtotalPiastres, 0)).toBe(line.lineTotalPiastres - (line.giftBox.personalization?.unitAdjustmentPiastres || 0));
    const box = components.find(part => part.category === 'box');
    const ribbon = components.find(part => part.category === 'ribbon');
    return { ...structuredClone(line), giftBox: {
      snapshotVersion: configuration.personalizationIntent ? 'gift-box-order-v2' : 'gift-box-order-v1',
      configuration,
      ...(configuration.personalizationIntent ? {personalization:{...configuration.personalizationIntent,photoCount:configuration.personalizationIntent.photoPrints.length,photoPrints:configuration.personalizationIntent.photoPrints.map(photo=>({...photo,pricePiastres:2000})),sticker:configuration.personalizationIntent.sticker ? {...configuration.personalizationIntent.sticker,pricePiastres:2000} : null,unitAdjustmentPiastres:line.giftBox.personalization.unitAdjustmentPiastres}} : {}),
      box: { componentId: box.componentId, displayName: box.displayName,
        quantityPerBox: 1, quantityForLine: line.quantity },
      items: components.filter(part => ['flower', 'plush', 'chocolate'].includes(part.category))
        .map(({ componentId, category, displayName, quantityPerBox, quantityForLine }) =>
          ({ componentId, category, displayName, quantityPerBox, quantityForLine })),
      ribbon: ribbon ? { componentId: ribbon.componentId, displayName: ribbon.displayName,
        quantityPerBox: 1, quantityForLine: line.quantity,
        colorHex: lookup(ribbon.componentId).approvedColorHex } : null,
      giftCard: selection.giftCard ? { selected: true, message: selection.giftCard.message } : { selected: false },
      components, artwork: { status: 'unavailable' },
    } };
  }
  await page.route('**/api/v1/commerce/orders', async route => {
    ensureLocal(route);
    if (isOptions(route)) return route.fulfill({ status: 204, headers });
    const body = route.request().postDataJSON(); audit.orders.push(body);
    expect(body.paymentMethod).toBe('instapay');
    expect(body.customer.governorate).toBe('cairo');
    if (!created) {
      const subtotal = fixture.state.cart.subtotalPiastres;
      created = { ...fixture.state.order, lines: fixture.state.cart.items.map(presentedOrderLine),
        accountingVersion: 1, personalized: true, orderChannel: 'website',
        paymentMethod: 'instapay', paymentState: 'awaiting_transfer',
        allowedPaymentMethods: ['instapay'], checkoutKey: body.checkoutKey,
        customer: body.customer, shipping: { amountPiastres: null },
        totals: { subtotalPiastres: subtotal, discountPiastres: 0,
          shippingPiastres: null, totalPiastres: subtotal },
        paymentInstructions: null, canCancel: false };
      fixture.state.order = created;
      fixture.state.cart = { items: [], subtotalPiastres: 0, quantity: 0 };
    }
    expect(body.checkoutKey).toBe(created.checkoutKey);
    return reply(route, { order: created });
  });
  return { fixture, audit, savedOrder: () => created };
}
