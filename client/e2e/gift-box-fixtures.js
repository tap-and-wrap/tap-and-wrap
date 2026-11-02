// Synthetic names/prices exist only in isolated browser tests.
import { mockCommerce } from './commerce-fixtures.js';
import { FIXED_COMPONENTS } from '../../shared/gift-box/definitions.mjs';
const headers = { 'access-control-allow-origin': 'http://127.0.0.1:5191', 'access-control-allow-credentials': 'true', 'access-control-allow-headers': 'content-type,x-csrf-token', 'access-control-allow-methods': 'GET,POST,PATCH,OPTIONS' };
export async function giftBoxFixture(page, options = {}) {
  const base = await mockCommerce(page, options);
  const components = FIXED_COMPONENTS.map(item => ({ componentId: item.id, category: item.category, displayName: `Fixture ${item.id}`, displayOrder: item.initialDisplayOrder,
    enabled: !options.unpriced, available: !options.unpriced, inventoryMode: item.category === 'ribbon' ? 'status_only' : 'tracked', inventoryQuantity: item.category === 'ribbon' ? null : 100,
    ...(item.category === 'ribbon' ? { approvedColorHex: item.approvedColorHex } : {}), pricePiastres: options.unpriced ? null : 1000, pricing: options.unpriced ? 'pending' : 'paid', revision: 1, configured: true,
    ...options.componentOverrides?.[item.id] }));
  function refreshAvailability() {
    for (const item of components) {
      item.inventoryStatus = !item.available ? 'unavailable' : item.inventoryMode === 'tracked' && item.inventoryQuantity === 0 ? 'insufficient_stock' : item.inventoryMode === 'tracked' && !Number.isSafeInteger(item.inventoryQuantity) || !item.inventoryMode ? 'inventory_pending' : 'available';
      item.availableForEstimate = item.enabled && item.pricePiastres !== null && item.inventoryStatus === 'available';
    }
  }
  refreshAvailability();
  const estimates = [], patches = [], calls = [], media = [];
  let failCatalog = options.failCatalog, failEstimate = options.failEstimate;
  page.on('request', request => { if (request.url().includes('/__gift-box-local/')) media.push(new URL(request.url()).pathname); });
  await page.route(/\/api\/v1\/(?:admin\/)?gift-box\//, async route => {
    const request = route.request(), path = new URL(request.url()).pathname, method = request.method();
    if (method === 'OPTIONS') return route.fulfill({ status: 204, headers });
    calls.push({ path, method });
    const reply = data => route.fulfill({ headers, json: { ok: true, data } });
    const fail = (status, code, message) => route.fulfill({ headers, status, json: { ok: false, error: { code, message } } });
    if (path.endsWith('/estimate')) {
      const body = request.postDataJSON(); estimates.push(body);
      if (failEstimate) return fail(409, 'GIFT_BOX_PRICE_PENDING', 'A selected price needs approval.');
      refreshAvailability();
      const lines = [{ componentId: body.boxId, quantity: 1 }, ...body.items, ...(body.ribbonId ? [{ componentId: body.ribbonId, quantity: 1 }] : []), ...(body.giftCard ? [{ componentId: body.giftCard.componentId, quantity: 1 }] : [])];
      if (lines.some(line => { const record = components.find(item => item.componentId === line.componentId); return !record?.availableForEstimate || record.inventoryMode === 'tracked' && line.quantity > record.inventoryQuantity; })) return fail(409, 'GIFT_BOX_STOCK_EXCEEDED', 'A selected quantity exceeds current tracked stock. Review your selection.');
      const items = lines.map(line => { const record = components.find(item => item.componentId === line.componentId); return { ...line, lineSubtotalPiastres: line.quantity * record.pricePiastres, unitPricePiastres: record.pricePiastres, displayName: record.displayName }; });
      return reply({ estimate: { items, componentSubtotalPiastres: items.reduce((sum, item) => sum + item.lineSubtotalPiastres, 0), arrangementApproved: false, submissionAllowed: false, orderConversionAllowed: false } });
    }
    if (method === 'PATCH') {
      const body = request.postDataJSON(); patches.push({ path, body });
      if (options.conflict) return fail(409, 'EDIT_CONFLICT', 'The setting changed. Reload it before saving.');
      if (path.endsWith('/reorder')) {
        if (body.items.some(item => components.find(record => record.componentId === item.componentId)?.revision !== item.expectedRevision)) return fail(409, 'EDIT_CONFLICT', 'The category changed. Reload before saving.');
        const reordered = body.items.map((item, index) => { const record = components.find(entry => entry.componentId === item.componentId); record.displayOrder = index + 1; record.revision++; return record; });
        return reply({ category: body.category, components: reordered });
      }
      const record = components.find(item => item.componentId === path.split('/').at(-1));
      for (const key of ['displayName', 'displayOrder', 'enabled', 'available', 'pricePiastres', 'inventoryMode', 'inventoryQuantity']) if (Object.hasOwn(body, key)) record[key] = body[key];
      record.revision++; refreshAvailability(); return reply({ component: record });
    }
    if (failCatalog) return fail(503, 'GIFT_BOX_BACKEND_DISABLED', 'Builder choices are not enabled.');
    refreshAvailability();
    const id = path.split('/').at(-1), record = components.find(item => item.componentId === id);
    if (record) return reply({ component: record });
    return reply({ components, pagination: { total: components.length, pages: 1 }, pendingCategories: [], submissionAllowed: false, directCommerceEnabled: options.directCommerceEnabled === true, orderableBoxIds: options.directCommerceEnabled ? ['box-2'] : [] });
  });
  return { ...base, components, estimates, patches, calls, media, recoverCatalog: () => { failCatalog = false; }, recoverEstimate: () => { failEstimate = false; } };
}
export async function beginGiftBox(page) {
  await page.goto('/customize/gift-box'); await page.getByRole('button', { name: 'Choose Fixture box-2', exact: true }).click();
}
