import { assertDatabaseWriteAllowed } from '../config/database-safety.js';
import { env } from '../config/env.js';
import { publicProductEngraving } from '../catalog/public-presentation.js';
import { SiteContent } from '../models/SiteContent.js';
import { fingerprint } from '../commerce/pricing.js';
import { validateUploadReferences } from '../commerce/uploads.js';
import { commerceError } from '../commerce/errors.js';
import { productEngravingCartInput, productEngravingDesignInput } from './contracts.js';
import { productEngravingCapable, productSurfaceId, productArtworkIds, productEngravingColors } from '../../../shared/product-engraving.mjs';
import { FONT_REGISTRY } from '../../../shared/engraving/definitions.mjs';
const fail = message => { throw commerceError(409, 'PRODUCT_ENGRAVING_REVIEW_REQUIRED', message); };
export async function productEngravingPrice({ session } = {}) {
  const record = await SiteContent.findOne({ key: 'website-v1' }).select('productEngravingPricePiastres productEngravingPriceVersion __v').session(session || null).lean().maxTimeMS(3000);
  return { pricePiastres: record?.productEngravingPricePiastres ?? 10000, version: record?.productEngravingPriceVersion ?? 0, revision: record?.productEngravingPriceVersion ?? 0 };
}
export async function quoteProductEngraving(product, raw, owner, { session, files = true, preview = false, variantKey = null, basePricePiastres } = {}) {
  const spec = (preview ? productEngravingDesignInput : productEngravingCartInput).parse(raw), c = product.productEngraving;
  if (!publicProductEngraving(product) || !productEngravingCapable(product) || c.version !== spec.configurationVersion || !c.materials.includes(spec.material)) fail('The approved engraving setup changed. Review this product again.');
  const modern = spec.contractVersion === 'product-engraving-v2';
  if (!modern && (!product.galleryKeys?.includes(c.imageKey) || !(c.width > 0 && c.height > 0) || spec.design.surface.assetId !== productSurfaceId(product._id, c.version) || Math.abs(spec.design.surface.aspectRatio - c.width / c.height) > .000001 || !c.materials.includes(spec.material) || spec.placement && !c.placements?.includes(spec.placement))) fail('The approved engraving setup changed. Review this product again.');
  const text = modern ? [{ text: spec.text, fontId: spec.fontId }] : spec.design.layers.filter(layer => layer.type === 'text');
  if (modern && !productEngravingColors(c).includes(spec.colorId)) fail('Choose an approved engraving appearance.');
  if (text.reduce((n, layer) => n + [...layer.text].length, 0) > 500 || text.some(layer => !c.fontIds.includes(layer.fontId) || /\p{Script=Arabic}/u.test(layer.text) && FONT_REGISTRY.find(font => font.id === layer.fontId)?.language !== 'ar')) fail('Use currently approved fonts and up to 500 characters.');
  const ids = productArtworkIds(spec);
  if (files) { const uploads = await validateUploadReferences(ids, owner, { purpose: 'artwork', session });
    if (uploads.some(upload => String(upload.productId) !== String(product._id) || upload.designKey !== spec.designKey || upload.fieldKey !== 'product_engraving_artwork' || upload.sizeBytes > 8388608 || Math.abs(spec.design.layers.find(layer => layer.type === 'image' && layer.assetId === String(upload._id)).aspectRatio - upload.width / upload.height) > .000001)) fail('Replace artwork belonging to another product or image role.');
  }
  const price = await productEngravingPrice({ session });
  const reviewFingerprint = fingerprint({ owner, productId: String(product._id), variantKey, basePricePiastres, configuration: c, priceVersion: price.version, surcharge: price.pricePiastres });
  if (!preview && raw.reviewFingerprint !== reviewFingerprint) fail('The engraving price or configuration changed. Edit and review your design.');
  return { productId: String(product._id), variantKey, specification: spec, configuration: publicProductEngraving(product), surchargePiastres: price.pricePiastres, priceVersion: price.version, reviewFingerprint, uploadIds: ids };
}
export async function fenceProductEngravingPrice(lines, session) {
  const entries = lines.filter(line => line.productEngravingSnapshot);
  if (!entries.length) return;
  const version = entries[0].productEngravingSnapshot.priceVersion;
  if (entries.some(line => line.productEngravingSnapshot.priceVersion !== version)) fail('Review the current engraving price.');
  // One shared write fence makes concurrent price changes conflict with checkout.
  assertDatabaseWriteAllowed(SiteContent.db, env);
  const result = await SiteContent.updateOne({ key: 'website-v1', ...(version === 0 ? { $or: [{ productEngravingPriceVersion: 0 }, { productEngravingPriceVersion: { $exists: false } }] } : { productEngravingPriceVersion: version }) }, { $inc: { productEngravingPriceFence: 1 }, $setOnInsert: { key: 'website-v1', productEngravingPricePiastres: 10000, productEngravingPriceVersion: 0 } }, { session, upsert: version === 0 });
  if (!result.matchedCount && !result.upsertedCount) fail('The engraving price changed during checkout.');
}
export function productEngravingSummary(snapshot) {
  return { snapshotVersion: snapshot.specification.contractVersion === 'product-engraving-v2' ? 'product-engraving-order-v2' : 'product-engraving-order-v1', configurationVersion: snapshot.specification.configurationVersion, material: snapshot.specification.material, placement: snapshot.specification.placement, surchargePiastres: snapshot.surchargePiastres,
    ...(snapshot.specification.contractVersion === 'product-engraving-v2' ? { text: snapshot.specification.text, fontId: snapshot.specification.fontId, colorId: snapshot.specification.colorId } : { layers: snapshot.specification.design.layers.map(({ assetId, ...layer }) => { void assetId; return layer; }) }) };
}

export const productEditFingerprint = line => fingerprint({ productId: String(line.productId), variantKey: line.variantKey ?? null, quantity: line.quantity, personalization: line.personalization || {}, productEngraving: line.productEngraving });
