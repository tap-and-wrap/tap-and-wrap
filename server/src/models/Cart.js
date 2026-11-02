import mongoose from 'mongoose';
import { giftCartConfigurationInput } from '../commerce/cart-contract.js';
import { identifyGiftBoxConfiguration } from '../gift-box/commerce-contract.js';
const productOnly = value => function () { return this.kind === 'gift_box_v2' ? undefined : value; };
const line = new mongoose.Schema({
  id: { type: String, required: true }, identity: { type: String, required: true },
  kind: { type: String, enum: ['product', 'gift_box_v2'] },
  productId: { type: mongoose.Schema.Types.ObjectId, required() { return this.kind !== 'gift_box_v2'; }, ref: 'Product' },
  name: { type: String, maxlength: 240 }, slug: { type: String, maxlength: 300 }, mainImageUrl: { type: String, maxlength: 2000, default: productOnly(null) },
  variantKey: { type: String, default: productOnly(null) }, quantity: { type: Number, min: 1, max: 99, required: true, validate: Number.isSafeInteger },
  personalization: { type: mongoose.Schema.Types.Mixed, default: productOnly({}) }, customization: { type: mongoose.Schema.Types.Mixed, default: productOnly(null) },
}, { _id: false, strict: 'throw', discriminatorKey: 'kind', versionKey: false });
line.pre('validate', function () {
  if (this.kind === 'gift_box_v2') {
    for (const key of ['productId', 'slug', 'mainImageUrl', 'variantKey', 'personalization', 'customization']) {
      if (this.get(key) !== undefined) this.invalidate(key, 'Product fields cannot appear on a configured gift line.');
    }
  }
});
// Embedded rows share the Cart's optimistic revision. Disabling their unused
// version key also keeps Mongoose transaction rollback from setting an unknown
// embedded __v path under strict discriminator schemas.
const addOperation = new mongoose.Schema({ key: { type: String, required: true }, requestHash: { type: String, required: true } },
  { _id: false, strict: 'throw', versionKey: false });
const schema = new mongoose.Schema({
  addOperations: { type: [addOperation], default: [], validate: value => value.length <= 60 },
  owner: { type: String, required: true, unique: true }, items: { type: [line], default: [], validate: value => value.length <= 30 },
  expiresAt: { type: Date, required: true },
}, { timestamps: true, strict: 'throw', optimisticConcurrency: true });
// Keep Product fields on the base so historical rows without a discriminator
// still hydrate and validate as ordinary products, without a data migration.
schema.path('items').discriminator('product', new mongoose.Schema({}, { _id: false, strict: 'throw', versionKey: false }));
const giftLine = new mongoose.Schema({
  configurationId: { type: String, required: true, match: /^gift-box-configuration-v1:[a-f0-9]{64}$/ },
  configuration: { type: mongoose.Schema.Types.Mixed, required: true },
}, { _id: false, strict: 'throw', versionKey: false });
giftLine.pre('validate', function () {
  // Stale/corrupt persisted configurations are shown as invalid by repricing.
  // An unrelated removal must not force their migration or prevent recovery.
  // Direct configuration changes and every new/pushed line remain strict.
  const owner = this.ownerDocument();
  const itemPrefix = `items.${owner.items.indexOf(this)}.`;
  const editedPaths = [...this.directModifiedPaths(), ...owner.directModifiedPaths()
    .filter(path => path.startsWith(itemPrefix)).map(path => path.slice(itemPrefix.length))];
  const configurationEdited = editedPaths.some(path => ['configuration', 'configurationId', 'identity']
    .some(field => path === field || path.startsWith(`${field}.`)));
  if (!this.isNew && !configurationEdited) return;
  const parsed = giftCartConfigurationInput.safeParse(this.configuration);
  if (!parsed.success) { this.invalidate('configuration', 'A valid supported gift configuration is required.'); return; }
  const canonical = identifyGiftBoxConfiguration(parsed.data);
  if (this.configurationId !== canonical.configurationId || this.identity !== canonical.configurationId
    || JSON.stringify(this.configuration) !== JSON.stringify(canonical.configuration)) {
    this.invalidate('configuration', 'Persist only the server canonical configuration and matching identity.');
  }
});
schema.path('items').discriminator('gift_box_v2', giftLine);
schema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });
export const Cart = mongoose.model('Cart', schema);
