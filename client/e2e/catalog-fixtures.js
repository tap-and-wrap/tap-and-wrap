// Isolated browser fixtures only. No catalog import, database, cart or payment request.
export const category = { _id: '111111111111111111111111', name: 'Fixture Gifts', slug: 'fixture-gifts', parentId: null, active: true, featured: true, productCount: 41 };
export const subcategory = { _id: '222222222222222222222222', name: 'Fixture Keepsakes', slug: 'fixture-keepsakes', parentId: category._id, active: true, productCount: 41 };
export const cards = Array.from({ length: 41 }, (_, index) => ({
  _id: String(index + 100).padStart(24, '0'), name: `Fixture Gift ${String(index + 1).padStart(2, '0')}`, slug: `fixture-gift-${index + 1}`,
  category, subcategory, mainImageUrl: null, pricePiastres: 1000 + index * 100, compareAtPiastres: index === 0 ? 2000 : null,
  priceApproved: true, orderingAvailable: index !== 2, requiresOptions: index === 1, bestSeller: index < 10, featured: index < 5,
}));
export const detail = {
  ...cards[1], mainImageUrl: 'https://fixture.invalid/main.svg', galleryUrls: ['https://fixture.invalid/main.svg', 'https://fixture.invalid/second.svg'],
  description: 'Isolated product fixture description.', inventory: { mode: 'tracked', quantity: 10, available: true },
  variants: [
    { key: 'small-rose', attributes: [{ name: 'Size', value: 'Small' }, { name: 'Color', value: 'Rose' }], pricePiastres: 1234, orderingAvailable: true, inventory: { mode: 'tracked', quantity: 3, available: true } },
    { key: 'large-rose', attributes: [{ name: 'Size', value: 'Large' }], pricePiastres: 1500, orderingAvailable: false, inventory: { mode: 'tracked', quantity: 0, available: false } },
  ],
  personalization: { fields: [{ key: 'name', label: 'Gift name', type: 'short_text', required: true, maxLength: 30 }, { key: 'photo', label: 'Gift photo', type: 'image', required: true }] },
  customization: { enabled: false, templateId: null, serviceKind: null }, relatedProducts: cards.slice(4, 8),
};
export const adminProduct = {
  ...cards[0], categoryId: category._id, subcategoryId: subcategory._id, status: 'draft', sku: 'FIXTURE-001',
  description: 'Isolated admin fixture.', inventory: { mode: 'tracked', quantity: 10, approved: true, available: true },
  galleryKeys: ['Fixtures/primary.webp', 'Fixtures/secondary.webp'], mainImageKey: 'Fixtures/primary.webp', variants: [],
  personalization: detail.personalization, customization: { enabled: true, templateId: '333333333333333333333333', serviceKind: 'laser_engraving' },
  reviewRequired: false, reviewReasons: [], featuredOrder: 0, bestSellerOrder: 0,
};
export const previewProduct = {
  ...detail,
  status: 'draft', externalCatalogId: 'FIXTURE-PREVIEW-001', catalogRole: 'Product',
  pricePiastres: null, compareAtPiastres: null, priceApproved: false, orderingAvailable: false,
  mainImageUrl: null, galleryUrls: [],
  gallerySlots: [{ position: 1, url: null, isMain: true }, { position: 2, url: null, isMain: false }, { position: 3, url: null, isMain: false }],
  inventory: { mode: 'tracked', quantity: 10, approved: false, available: false },
  variants: [], customization: adminProduct.customization, relatedProducts: [],
  preview: { enabled: true, inventoryApproved: false, reviewRequired: true },
};

export async function mockCatalog(page, options = {}) {
  const requests = [];
  const saves = [];
  const headers = { 'Access-Control-Allow-Origin': 'http://127.0.0.1:5191', 'Access-Control-Allow-Credentials': 'true', 'Access-Control-Allow-Headers': 'content-type,x-csrf-token,x-tracking-consent', 'Access-Control-Allow-Methods': 'GET,POST,PATCH,OPTIONS' };
  await page.route('https://fixture.invalid/**', (route) => route.fulfill({ contentType: 'image/svg+xml', body: '<svg xmlns="http://www.w3.org/2000/svg" width="900" height="900"><rect width="900" height="900" fill="#eadad5"/></svg>' }));
  await page.route('**/api/v1/**', async (route) => {
    const request = route.request();
    if (request.method() === 'OPTIONS') return route.fulfill({ status: 204, headers });
    const url = new URL(request.url());
    const path = url.pathname.replace('/api/v1', '');
    requests.push({ path, params: Object.fromEntries(url.searchParams), method: request.method() });
    const reply = (data, status = 200) => route.fulfill({ status, headers, json: status < 400 ? { ok: true, data } : { ok: false, error: data } });
    if (path === '/tracking/config') return reply({ enabled: false, consent: false });
    if (path === '/public/site-content') return reply({ about: null, contact: null, policies: {}, faq: [], featuredReviews: [] });
    if (path === '/public/bundles') return reply({ bundles: [] });
    if (/^\/public\/products\/[^/]+\/reviews$/.test(path)) return reply({ reviews: [], pagination: { page: 1, limit: 20, total: 0, pages: 0 } });
    if (path === '/auth/me') return options.role ? reply({ user: { id: 'fixture-user', name: 'Fixture User', role: options.role } }) : reply({ message: 'Sign in required' }, 401);
    if (path === '/admin/ping') return options.role === 'admin' && !options.denyAdmin ? reply({ admin: true }) : reply({ message: 'Admin required' }, 403);
    if (path === '/auth/csrf') return reply({ csrfToken: 'isolated-fixture-token' });
    if (path === '/commerce/cart') return reply({ cart: { items: [], quantity: 0, subtotalPiastres: 0 }, checkoutEnabled: false });
    if (path === '/commerce/checkout/config') return reply({ enabled: false, governorates: [], instaPayNumber: '01060673073' });
    if (path.endsWith('/categories')) return reply({ categories: url.searchParams.get('parent') === 'root' ? [category] : [subcategory], pagination: { page: 1, limit: 20, total: 1, pages: 1 } });
    if (path === '/public/products' || path === '/admin/products' && request.method() === 'GET') {
      if (options.beforeList) await options.beforeList();
      if (options.listError?.()) return reply({ message: 'Fixture service failure' }, 503);
      let rows = options.empty ? [] : [...cards];
      const query = url.searchParams;
      if (query.get('q')) rows = rows.filter((item) => item.name.toLowerCase().includes(query.get('q').toLowerCase()));
      if (query.get('availability')) rows = rows.filter((item) => item.orderingAvailable === (query.get('availability') === 'available'));
      if (query.get('bestSeller') === 'true') rows = rows.filter((item) => item.bestSeller && item.orderingAvailable);
      if (query.get('category') && query.get('category') !== category.slug) rows = [];
      const rangeRows = rows;
      if (query.has('minPrice')) rows = rows.filter((item) => item.pricePiastres >= Number(query.get('minPrice')));
      if (query.has('maxPrice')) rows = rows.filter((item) => item.pricePiastres <= Number(query.get('maxPrice')));
      const sort = query.get('sort');
      if (sort === 'price_asc') rows.sort((a, b) => a.pricePiastres - b.pricePiastres);
      if (sort === 'price_desc') rows.sort((a, b) => b.pricePiastres - a.pricePiastres);
      if (sort === 'name_asc') rows.sort((a, b) => a.name.localeCompare(b.name));
      if (sort === 'name_desc') rows.sort((a, b) => b.name.localeCompare(a.name));
      const current = Number(query.get('page') || 1);
      const limit = Math.min(20, Number(query.get('limit') || 20));
      const products = rows.slice((current - 1) * limit, current * limit).map((item) => path.startsWith('/admin') ? { ...adminProduct, ...item } : item);
      return reply({ products, pagination: { page: current, limit, total: rows.length, pages: Math.ceil(rows.length / limit) }, priceRange: { min: Math.min(...rangeRows.map((item) => item.pricePiastres)), max: Math.max(...rangeRows.map((item) => item.pricePiastres)) } });
    }
    if (path.startsWith('/public/products/')) {
      if (path.endsWith('/unapproved')) return reply({ message: 'Product not found' }, 404);
      return reply({ product: options.product || detail });
    }
    if (path.startsWith('/admin/products/') && path.endsWith('/preview') && request.method() === 'GET') {
      if (options.role !== 'admin') return reply({ message: 'Admin required' }, options.role ? 403 : 401);
      if (options.beforePreview) await options.beforePreview();
      if (options.previewError) return reply({ message: 'Staging preview is unavailable' }, options.previewError);
      return reply({ product: options.previewProduct || previewProduct });
    }
    if (path.startsWith('/admin/products/') && request.method() === 'GET') return reply({ product: adminProduct });
    if (path.startsWith('/admin/products') && ['PATCH', 'POST'].includes(request.method())) {
      const payload = request.postDataJSON();
      saves.push({ payload, csrf: request.headers()['x-csrf-token'] });
      if (options.saveError) return reply({ message: 'Ready requires approval.', details: [{ field: 'priceApproved', message: 'Approve price before publication.' }] }, 400);
      return reply({ product: { ...adminProduct, ...payload } });
    }
    return reply({ message: `Unexpected isolated request: ${path}` }, 404);
  });
  return { requests, saves };
}
