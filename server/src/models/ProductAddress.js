import mongoose from 'mongoose';

const schema = new mongoose.Schema({
  slug: { type: String, required: true, maxlength: 300, match: /^[a-z0-9]+(?:-[a-z0-9]+)*$/, immutable: true },
  productId: { type: mongoose.Schema.Types.ObjectId, ref: 'Product', required: true, immutable: true },
  canonical: { type: Boolean, required: true, default: false },
}, { strict: 'throw', timestamps: true, autoCreate: false, autoIndex: false });
schema.index({ slug: 1 }, { unique: true, name: 'product_address_unique' });
schema.index({ productId: 1 }, { unique: true, partialFilterExpression: { canonical: true }, name: 'product_canonical_unique' });
schema.index({ productId: 1, slug: 1 }, { name: 'product_address_owner' });
export const ProductAddress = mongoose.model('ProductAddress', schema);
