import { Router } from 'express';
import mongoose from 'mongoose';
import { z } from 'zod';
import { Product } from '../models/Product.js';
import { SiteContent } from '../models/SiteContent.js';
import { Cart } from '../models/Cart.js';
import { Order } from '../models/Order.js';
import { loadEligibleProduct } from '../commerce/pricing.js';
import { inventoryCanOrder } from '../catalog/public-presentation.js';
import { publicProductEngraving } from '../catalog/public-presentation.js';
import { productEngravingPrice, quoteProductEngraving, productEditFingerprint } from './service.js';
import { productEngravingDesignInput } from './contracts.js';
import { commerceError } from '../commerce/errors.js';
import { assertDatabaseWriteAllowed } from '../config/database-safety.js';
import { env } from '../config/env.js';
import { recordAdminAudit } from '../commerce/audit.js';
export const productEngravingRoutes = Router(), adminProductEngravingRoutes = Router();
const reply = (res, data) => res.json({ ok: true, data }), id = z.string().regex(/^[a-f0-9]{24}$/i);
productEngravingRoutes.get('/product-engraving/price', async (req, res) => reply(res, await productEngravingPrice()));
productEngravingRoutes.post('/product-engraving/quote', async (req, res) => {
  const input = z.object({ productId: id, variantKey: z.string().max(80).nullable(), quantity: z.number().int().min(1).max(99), specification: productEngravingDesignInput }).strict().parse(req.body);
  const product = await loadEligibleProduct(input.productId), variant = product.variants.find(variant => variant.key === input.variantKey);
  if (product.variants.length && !variant || !product.variants.length && input.variantKey || variant && (!inventoryCanOrder(variant.inventory))) throw commerceError(409, 'VARIANT_REQUIRED', 'Choose an available variant.');
  const stock = variant?.inventory || product.inventory;
  if (stock.mode === 'tracked' && stock.quantity < input.quantity) throw commerceError(409, 'INSUFFICIENT_STOCK', 'This quantity is unavailable.');
  const basePricePiastres = variant?.pricePiastres ?? product.pricePiastres;
  if (!Number.isSafeInteger(basePricePiastres) || basePricePiastres <= 0) throw commerceError(409, 'PRICE_REQUIRED', 'Request a price for this selection.');
  const quoted = await quoteProductEngraving(product, input.specification, req.commerceOwner, { files: false, preview: true, variantKey: variant?.key || null, basePricePiastres });
  reply(res, { basePricePiastres, surchargePiastres: quoted.surchargePiastres, unitPricePiastres: basePricePiastres + quoted.surchargePiastres, totalPiastres: (basePricePiastres + quoted.surchargePiastres) * input.quantity, reviewFingerprint: quoted.reviewFingerprint });
});
productEngravingRoutes.get('/product-engraving/cart/:lineId', async (req, res) => {
  const cart = await Cart.findOne({ owner: req.commerceOwner, expiresAt: { $gt: new Date() } }).lean().maxTimeMS(3000), line = cart?.items.find(line => line.id === z.uuid().parse(req.params.lineId) && line.kind === 'product' && line.productEngraving);
  if (!line) throw commerceError(404, 'CART_ITEM_NOT_FOUND', 'This product design is unavailable.');
  const product = await Product.findById(line.productId).lean().maxTimeMS(3000);
  reply(res, { productId: String(line.productId), variantKey: line.variantKey, quantity: line.quantity, personalization: line.personalization, specification: line.productEngraving, configuration: product ? publicProductEngraving(product) : null, editFingerprint: productEditFingerprint(line) });
});
async function orderDesign(req, res, admin) {
  const order = await Order.findOne({ _id: id.parse(req.params.id), ...(admin ? {} : { owner: req.commerceOwner }) }).select('lines').lean().maxTimeMS(3000), index = z.coerce.number().int().min(0).max(29).parse(req.params.index), line = order?.lines[index];
  if (!line?.productEngraving) throw commerceError(404, 'ORDER_NOT_FOUND', 'This product design is unavailable.');
  reply(res, { snapshot: line.productEngraving });
}
productEngravingRoutes.get('/orders/:id/product-engraving/:index', (req, res) => orderDesign(req, res, false));
adminProductEngravingRoutes.get('/orders/:id/product-engraving/:index', (req, res) => orderDesign(req, res, true));
adminProductEngravingRoutes.get('/product-engraving/price', async (req, res) => reply(res, await productEngravingPrice()));
adminProductEngravingRoutes.patch('/product-engraving/price', async (req, res) => {
  const input = z.object({ expectedRevision: z.number().int().nonnegative(), pricePiastres: z.number().int().min(0).max(100000000) }).strict().parse(req.body);
  assertDatabaseWriteAllowed(SiteContent.db, env);
  try { await mongoose.connection.transaction(async session => {
    const record = await SiteContent.findOne({ key: 'website-v1' }).session(session) || new SiteContent({ key: 'website-v1' });
    if ((record.productEngravingPriceVersion || 0) !== input.expectedRevision) throw commerceError(409, 'EDIT_CONFLICT', 'This setting changed. Your draft is retained; reload it before saving.');
    record.productEngravingPricePiastres = input.pricePiastres; record.productEngravingPriceVersion = (record.productEngravingPriceVersion || 0) + 1;
    await record.save({ session }); await recordAdminAudit(req.user, { action: 'product_engraving.price_updated', resourceType: 'configuration', resourceId: String(record._id), details: { priceVersion: record.productEngravingPriceVersion } }, { session });
  }); } catch (error) { if (error.code === 11000 || error instanceof mongoose.Error.VersionError) throw commerceError(409, 'EDIT_CONFLICT', 'This setting changed. Reload before saving.'); throw error; }
  reply(res, await productEngravingPrice());
});
