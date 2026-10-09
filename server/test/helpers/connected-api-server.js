// Explicitly isolated browser/API fixture. This is never an application entry point.
import { fileURLToPath } from 'node:url';
import { randomUUID } from 'node:crypto';

if (process.argv.length !== 3 || process.argv[2] !== '--isolated-contract-tests' || process.env.NODE_ENV !== 'test'
  || process.env.MONGODB_URI || process.env.CATALOG_IMPORT_STAGING_URI || process.env.NODE_OPTIONS) {
  throw new Error('Connected tests require the guarded isolated launcher and no inherited database/runtime options.');
}
const clientOrigin = 'http://127.0.0.1:5192';
const apiOrigin = 'http://127.0.0.1:4092';
Object.assign(process.env, {
  DATABASE_TARGET: 'local', MONGODB_URI: '', CATALOG_IMPORT_STAGING_URI: '', STAGING_PREVIEW_ENABLED: 'false',
  DOTENV_CONFIG_PATH: fileURLToPath(new URL('../.no-env-file', import.meta.url)),
  CLIENT_ORIGIN: clientOrigin, SESSION_SECRET: 'tap-wrap-connected-isolated-fixture-secret-never-production',
  CHECKOUT_ENABLED: 'false', COMMERCE_LAUNCH_AUTHORIZED: 'false', STORAGE_ENABLED: 'false',
  EMAIL_ENABLED: 'false', EMAIL_USER: '', EMAIL_APP_PASSWORD: '', EMAIL_SMOKE_TEST_ENABLED: 'false',
  NOTIFICATIONS_ENABLED: 'false', NOTIFICATION_LIVE_DELIVERY_ENABLED: 'false', NOTIFICATION_SAFE_RECIPIENTS: '', RESEND_API_KEY: '',
  META_ENABLED: 'false', META_POLICY_APPROVED: 'false', META_CAPI_ENABLED: 'false', META_PIXEL_ID: '', META_ACCESS_TOKEN: '',
  R2_ACCOUNT_ID: '', R2_ACCESS_KEY_ID: '', R2_SECRET_ACCESS_KEY: '', R2_BUCKET: '', CATALOG_MEDIA_BASE_URL: '',
  MONGOMS_PREFER_GLOBAL_PATH: 'false', MONGOMS_SYSTEM_BINARY: '',
  MONGOMS_RUNTIME_DOWNLOAD: 'false', TAP_WRAP_SKIP_DOTENV: 'true',
});
// Import runtime modules only after sanitization. Never call runtime connectDatabase.
const [{ default: express }, { default: mongoose }, { default: bcrypt }, { app }, { startTestDatabase }, storageModule] = await Promise.all([
  import('express'), import('mongoose'), import('bcryptjs'), import('../../src/app.js'), import('./database.js'), import('../../src/commerce/storage.js'),
]);
const { Category, Product, User, Order, Upload, Cart, CustomizationTemplate, ComponentOption } = mongoose.models;
let database;
let server;
async function stop() {
  if (server) await new Promise(resolve => server.close(resolve));
  await database?.stop();
}
try {
  database = await startTestDatabase({ models: Object.values(mongoose.models), transactions: true });
  const category = await Category.create({ name: 'Connected Fixture Category', slug: 'connected-fixture-category', active: true });
  const child = await Category.create({ name: 'Connected Fixture Child', slug: 'connected-fixture-child', parentId: category._id, active: true });
  const template = await CustomizationTemplate.create({ key: 'connected-laser', name: 'Connected approved engraving', kind: 'laser_engraving', status: 'approved', active: true,
    fields: [{ key: 'gift-message', label: 'Gift message', type: 'text', maxChars: 120 }],
    engraving: { textRequired: true, maxChars: 80, baseAdjustmentPiastres: 500, artworkAllowed: true, artworkRequired: true, artworkMaxFiles: 1,
      materials: [{ key: 'wood', label: 'Approved wood', adjustmentPiastres: 200 }],
      fonts: [{ key: 'plain', label: 'Approved plain font', adjustmentPiastres: 100 }],
      placements: [{ key: 'front', label: 'Approved front', adjustmentPiastres: 50 }] } });
  const product = await Product.create({ name: 'Connected approved laser product', slug: 'connected-laser-product', description: 'Isolated synthetic fixture.', categoryId: category._id,
    mainImageKey: 'fixtures/laser.webp', galleryKeys: ['fixtures/laser.webp'], pricePiastres: 10000, priceApproved: true,
    inventory: { mode: 'tracked', quantity: 10, approved: true, available: true }, status: 'ready',
    customization: { enabled: true, templateId: template._id, serviceKind: 'laser_engraving', serviceEntryEligible: true } });
  const giftComponents = await ComponentOption.create([
    { name: 'Connected synthetic chocolates', slug: 'connected-gift-chocolates', catalogRole: 'Customization Option', categoryId: category._id,
      mainImageKey: 'fixtures/chocolates.webp', galleryKeys: ['fixtures/chocolates.webp'], pricePiastres: 1550, priceApproved: true,
      inventory: { mode: 'tracked', quantity: 20, approved: true, available: true }, enabledForCustomization: true, configurationApproved: true, reviewRequired: false },
    { name: 'Connected unavailable flowers', slug: 'connected-gift-flowers', catalogRole: 'Customization Option', categoryId: category._id,
      mainImageKey: 'fixtures/flowers.webp', galleryKeys: ['fixtures/flowers.webp'], pricePiastres: 1000, priceApproved: true,
      inventory: { mode: 'tracked', quantity: 0, approved: true, available: false }, enabledForCustomization: true, configurationApproved: true, reviewRequired: false },
  ]);
  const giftTemplate = await CustomizationTemplate.create({ key: 'connected-gift-box', name: 'Connected approved gift configuration', kind: 'gift_box', status: 'approved', active: true,
    fields: [{ key: 'gift-message', label: 'Gift box message', type: 'textarea', required: true, maxChars: 80 }],
    groups: [{ key: 'contents', label: 'Gift box contents', minChoices: 1, maxChoices: 2, allowedActions: ['add', 'remove'], options: [
      { key: 'chocolates', label: 'Configured chocolates', componentId: giftComponents[0]._id, minQuantity: 1, maxQuantity: 3, priceAdjustmentPiastres: 50 },
      { key: 'flowers', label: 'Unavailable flowers', componentId: giftComponents[1]._id, minQuantity: 1, maxQuantity: 1 },
    ] }] });
  const giftProduct = await Product.create({ name: 'Connected approved gift box', slug: 'connected-gift-box-product', description: 'Isolated synthetic gift-box fixture.', categoryId: category._id,
    mainImageKey: 'fixtures/gift-box.webp', galleryKeys: ['fixtures/gift-box.webp'], pricePiastres: 8000, priceApproved: true,
    inventory: { mode: 'made_to_order', quantity: null, approved: true, available: true }, status: 'ready',
    customization: { enabled: true, templateId: giftTemplate._id, serviceKind: 'gift_box', serviceEntryEligible: true } });
  // Synthetic approved records solely for connected paging/filtering assertions.
  await Product.create(Array.from({ length: 25 }, (_, index) => ({ name: `ConnectedCatalogBatch3 product ${String(index + 1).padStart(2, '0')}`,
    slug: `connected-catalog-batch3-${index + 1}`, description: 'Disposable contract fixture, not merchant data.', categoryId: category._id, subcategoryId: child._id,
    mainImageKey: 'fixtures/catalog.webp', galleryKeys: ['fixtures/catalog.webp'], pricePiastres: 1100 + index * 100, priceApproved: true,
    inventory: { mode: 'tracked', quantity: index === 24 ? 0 : 10, approved: true, available: true }, status: 'ready' })));
  for (const status of ['draft', 'hold']) await Product.create({ name: `ConnectedCatalogBatch3 private ${status}`, slug: `connected-private-${status}`,
    categoryId: category._id, mainImageKey: 'fixtures/private.webp', galleryKeys: ['fixtures/private.webp'], pricePiastres: null, priceApproved: false,
    inventory: { mode: 'tracked', quantity: 10, approved: false, available: true }, status });
  const passwordHash = await bcrypt.hash('isolated-fixture-password', 4);
  const accounts = {};
  for (const [name, role] of [['admin', 'admin'], ['alice', 'customer'], ['bob', 'customer']]) accounts[name] = await User.create({ name: `Connected ${name}`, email: `${name}@connected.example.test`, role, passwordHash, active: true });
  for (const [name, number] of [['alice', '234567'], ['bob', '345678']]) await Order.create({ owner: `user:${accounts[name]._id}`, userId: accounts[name]._id,
    orderNumber: number, checkoutKey: randomUUID(), requestHash: randomUUID(), customer: { name: `Connected ${name}`, email: accounts[name].email, phone: '+201012345678', governorate: 'cairo', address: '10 Synthetic Fixture Street' },
    lines: [{ name: `Private ${name} fixture product`, quantity: 1, unitPricePiastres: 10000, lineTotalPiastres: 10000 }],
    totals: { subtotalPiastres: 10000, shippingPiastres: 9000, discountPiastres: 0, totalPiastres: 19000, applied: [] }, paymentMethod: 'cod', paymentState: 'unpaid',
    history: [{ event: 'order_received', actor: 'customer' }, { event: 'state_changed', actor: `admin:${accounts.admin._id}`, reason: 'PRIVATE_LEGACY_OPERATIONAL_NOTE', internalNote: 'PRIVATE_OPERATIONAL_NOTE', publicReason: 'Approved customer explanation' }] });
  const storage = storageModule.createMemoryStorage();
  const grants = new Map();
  let puts = 0;
  storage.signPut = async (key, metadata) => {
    const token = randomUUID();
    grants.set(token, { key, mimeType: metadata.mimeType, sizeBytes: metadata.sizeBytes, expiresAt: Date.now() + 300000 });
    return { url: `${apiOrigin}/__fixture/storage/${token}`, headers: { 'Content-Type': metadata.mimeType }, expiresInSeconds: 300 };
  };
  storageModule.setStorageForTests(storage);
  const fixtureApp = express();
  fixtureApp.use('/__fixture', (req, res, next) => {
    res.set('Cache-Control', 'no-store');
    if (req.headers.origin && req.headers.origin !== clientOrigin) return res.sendStatus(403);
    res.set('Access-Control-Allow-Origin', clientOrigin);
    res.set('Access-Control-Allow-Methods', 'GET, PUT, OPTIONS');
    res.set('Access-Control-Allow-Headers', 'Content-Type, X-Fixture-Key');
    if (req.method === 'OPTIONS') return res.sendStatus(204);
    next();
  });
  fixtureApp.put('/__fixture/storage/:token', express.raw({ type: ['image/png', 'image/jpeg', 'image/webp'], limit: '10mb' }), (req, res) => {
    const grant = grants.get(req.params.token);
    if (!grant || grant.expiresAt < Date.now() || req.headers['content-type'] !== grant.mimeType || !Buffer.isBuffer(req.body) || req.body.length !== grant.sizeBytes) return res.sendStatus(400);
    storage.put(grant.key, req.body, grant.mimeType); grants.delete(req.params.token); puts += 1; res.sendStatus(200);
  });
  fixtureApp.get('/__fixture/ready', (req, res) => res.json({ isolated: true, checkoutEnabled: false, providersEnabled: false }));
  fixtureApp.get('/__fixture/state', async (req, res) => {
    if (req.headers['x-fixture-key'] !== 'connected-fixture-only') return res.sendStatus(403);
    const uploads = await Upload.find().select('_id state cartId fieldKey').lean();
    res.json({ productId: String(product._id), templateId: String(template._id), puts, uploads,
      giftBox: { productId: String(giftProduct._id), templateId: String(giftTemplate._id), componentId: String(giftComponents[0]._id),
        componentQuantity: (await ComponentOption.findById(giftComponents[0]._id).select('inventory.quantity').lean()).inventory.quantity },
      categoryId: String(category._id), childCategoryId: String(child._id),
      orders: await Order.find().select('_id orderNumber checkoutKey').lean(),
      carts: await Cart.find().select('items').lean(), orderCount: await Order.countDocuments({}) });
  });
  fixtureApp.use(app);
  server = fixtureApp.listen(4092, '127.0.0.1');
  server.on('error', async () => { await stop(); process.exit(1); });
  for (const signal of ['SIGTERM', 'SIGINT']) process.once(signal, async () => { await stop(); process.exit(0); });
} catch (error) { await stop(); throw error; }
