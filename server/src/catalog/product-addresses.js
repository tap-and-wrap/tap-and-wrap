import { ProductAddress } from '../models/ProductAddress.js';
import { Product } from '../models/Product.js';
import { env } from '../config/env.js';
import { assertDatabaseWriteAllowed } from '../config/database-safety.js';
import { productAddressCandidates, PRODUCT_SEGMENT } from '../../../shared/product-paths.mjs';

function conflict(message = 'This product address is reserved. Choose another stored slug.') {
  return Object.assign(new Error(message), { status: 409, code: 'PRODUCT_ADDRESS_RESERVED' });
}
export const productAliasesEnabled = () => env.productAliasesEnabled === true;
const invalidAddress = () => Object.assign(new Error('Product address needs operator review.'), { status: 503, code: 'PRODUCT_ADDRESS_CONFLICT' });
function addressOwner(address) {
  const owner = String(address.productId || '');
  if (!/^[a-f\d]{24}$/i.test(owner) || typeof address.slug !== 'string' || address.slug.length > 300 || !PRODUCT_SEGMENT.test(address.slug)) throw invalidAddress();
  return owner;
}

export async function productIdentityFilter(slug, { session } = {}) {
  if (!productAliasesEnabled()) return { slug };
  const address = await ProductAddress.findOne({ slug }).session(session || null).lean().maxTimeMS(3000);
  if (!address) return { slug }; // Safe rollout/rollback and unregistered legacy links.
  const owner = addressOwner(address);
  if (typeof address.canonical !== 'boolean') throw invalidAddress();
  const legacy = await Product.findOne({ slug }).select('_id').session(session || null).lean().maxTimeMS(3000);
  if (legacy && String(legacy._id) !== owner) throw invalidAddress();
  return { _id: owner }; // A deleted/hidden owner stays 404, never reassigned.
}

export async function attachProductPaths(products, { session } = {}) {
  if (!productAliasesEnabled() || !products.length) return products;
  if (products.length > 100) throw new Error('Product address batch exceeds limit');
  const addresses = await ProductAddress.find({ productId: { $in: products.map(product => product._id) }, canonical: true })
    .select('productId slug').session(session || null).lean().maxTimeMS(3000);
  const canonical = new Map(addresses.map(address => [addressOwner(address), `/products/${address.slug}`]));
  return products.map(product => ({ ...product, publicPath: canonical.get(String(product._id)) || `/products/${product.slug}` }));
}

// Must run in the same transaction as product creation/update/import. Address
// rows are never deleted or moved to another owner, including after deletion.
export async function reserveProductAddresses(product, { session, enabled = productAliasesEnabled() } = {}) {
  if (!enabled) return;
  if (!session?.inTransaction()) throw new Error('Product addresses require a transaction');
  assertDatabaseWriteAllowed(ProductAddress.db, env);
  const existingLegacy = await ProductAddress.findOne({ slug: product.slug }).session(session).lean().maxTimeMS(3000);
  if (existingLegacy && String(existingLegacy.productId) !== String(product._id)) throw conflict();
  if (!existingLegacy) await ProductAddress.create([{ slug: product.slug, productId: product._id, canonical: false }], { session });
  const existingCanonical = await ProductAddress.findOne({ productId: product._id, canonical: true }).session(session).lean().maxTimeMS(3000);
  if (existingCanonical) return existingCanonical.slug; // Renames retain the permanent URL.
  for (const slug of productAddressCandidates(product)) {
    const address = await ProductAddress.findOne({ slug }).session(session).lean().maxTimeMS(3000);
    if (address && String(address.productId) !== String(product._id)) continue;
    // An incomplete backfill or direct legacy writer must not be stolen from.
    if (await Product.exists({ slug, _id: { $ne: product._id } }).session(session).maxTimeMS(3000)) continue;
    if (address) await ProductAddress.updateOne({ _id: address._id, productId: product._id, canonical: false }, { $set: { canonical: true } }, { session });
    else await ProductAddress.create([{ slug, productId: product._id, canonical: true }], { session });
    return slug;
  }
  throw conflict('No unclaimed product address remains.');
}
