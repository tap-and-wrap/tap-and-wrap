import { createHash, randomUUID } from 'node:crypto';
import mongoose from 'mongoose';
import { Cart } from '../models/Cart.js';
import { env } from '../config/env.js';
import { assertDatabaseWriteAllowed } from '../config/database-safety.js';
import { quoteCartLine, publicCartLine, fingerprint } from './pricing.js';
import { createPricingContext } from './pricing-context.js';
import { transferUploadOwnership, attachUploadsToCart, detachUnusedCartUploads, assertUploadOwner } from './uploads.js';
import { commerceError, checkedMoney } from './errors.js';
import { attachProductPaths } from '../catalog/product-addresses.js';
import { cartItemInput, cartLineKind, cartQuantity } from './cart-contract.js';
import { identifyGiftBoxConfiguration } from '../gift-box/commerce-contract.js';
import { createGiftBoxCartPricingContext, quoteGiftBoxCartLine, giftBoxCartStockErrors,
  giftBoxCartSummary, publicGiftBoxCartLine, giftCartError, giftBoxOrderInventoryClaims } from '../gift-box/cart-pricing.js';
import { assertGiftBoxCheckoutCapability } from '../gift-box/checkout-guard.js';
import { giftBoxRuntimeCommerceOpen } from '../gift-box/runtime-commerce.js';

const expiresAt = () => new Date(Date.now() + 30 * 86400000);
export async function readCart(owner, { session } = {}) {
  assertUploadOwner(owner);
  return Cart.findOne({ owner, expiresAt: { $gt: new Date() } }).session(session || null).lean().maxTimeMS(3000);
}
export async function quoteCart(owner, options = {}) { return quoteCartCore(owner, options); }
export async function quoteCartForGiftBoxDisposableCheckout(owner, { session, capability } = {}) {
  assertGiftBoxCheckoutCapability(capability, owner);
  return quoteCartCore(owner, { session, strict: true }, capability);
}
async function quoteCartCore(owner, { session, strict = false } = {}, capability = null) {
  if (capability) assertGiftBoxCheckoutCapability(capability, owner);
  const cart = await readCart(owner, { session });
  const lines = cart?.items || [];
  // This gate is unconditional, including synthetic policy fixtures. Existing
  // checkout/order services use strict quotes and can never consume gift claims.
  if (strict && !capability && !giftBoxRuntimeCommerceOpen(env) && lines.some(line => line.kind === 'gift_box_v2')) throw commerceError(409, 'GIFT_BOX_CHECKOUT_DISABLED', 'Gift-box checkout is not available. Ordinary products can be ordered separately.');
  if (!session && lines.some(line => line.kind === 'gift_box_v2')) {
    return mongoose.connection.transaction(readSession => quoteCartCore(owner, { session: readSession, strict }, capability), { readConcern: { level: 'snapshot' } });
  }
  if (strict && !capability && !env.giftBoxPersonalizedCheckoutEnabled
    && lines.some(line => line.kind === 'gift_box_v2' && line.configuration?.personalizationIntent))
    throw commerceError(409, 'GIFT_BOX_PERSONALIZED_CHECKOUT_DISABLED', 'Personalized Gift Box checkout is not yet available. Your cart and photos remain saved.');
  const context = await createPricingContext(lines.filter(line => line.kind === undefined || line.kind === 'product'), owner, { session });
  const giftContext = await createGiftBoxCartPricingContext(lines, { session, owner, cartId: cart?._id });
  const items = [];
  for (const item of lines) {
    try {
      const kind = cartLineKind(item);
      const quoted = kind === 'gift_box_v2' ? quoteGiftBoxCartLine(item, giftContext) : { ...await quoteCartLine(item, owner, { session, context }), kind: 'product' };
      if ((capability || strict && giftBoxRuntimeCommerceOpen(env)) && kind === 'gift_box_v2') quoted.inventoryClaims = giftBoxOrderInventoryClaims(quoted);
      const expiries = quoted.uploadIds.map(id => (kind === 'gift_box_v2' ? giftContext?.giftUploads : context.uploads)?.get(String(id))?.expiresAt).filter(Boolean);
      items.push({ ...quoted, ...(expiries.length ? { attachments: { status: 'temporary', expiresAt: new Date(Math.min(...expiries.map(date => date.getTime()))), replacementRequired: false } } : {}) });
    }
    catch (error) {
      if (strict || !error.status || error.status >= 500) throw error;
      if (item.kind === 'gift_box_v2') {
        items.push({ id: item.id, kind: 'gift_box_v2', name: 'Build Your Gift Box', quantity: item.quantity,
          valid: false, error: error.message, errorCode: error.code,
          giftBox: giftBoxCartSummary(item.configuration, giftContext?.savedSettings), unitPricePiastres: null, lineTotalPiastres: null });
        continue;
      }
      const uploadedFields = [...Object.entries(item.personalization || {}), ...Object.entries(item.customization?.fields || {})]
        .filter(([key, value]) => /^[a-z][a-z0-9_-]{0,79}$/i.test(key) && Array.isArray(value) && value.length > 0).map(([key]) => key);
      items.push({ id: item.id, kind: item.kind || 'product', productId: String(item.productId), name: item.name || 'Unavailable product', slug: item.slug || null, mainImageUrl: item.mainImageUrl || null, quantity: item.quantity, valid: false, error: error.message, errorCode: error.code || 'CART_ITEM_UNAVAILABLE',
        ...(error.code === 'INVALID_UPLOAD_REFERENCES' && uploadedFields.length ? { attachments: { status: 'unavailable', replacementRequired: true, fieldKeys: [...new Set(uploadedFields)], expiresAt: null } } : {}), unitPricePiastres: null, lineTotalPiastres: null });
    }
  }
  for (const [id, error] of giftBoxCartStockErrors(items, giftContext)) {
    if (strict) throw error;
    const item = items.find(line => line.id === id);
    Object.assign(item, { valid: false, error: error.message, errorCode: error.code, unitPricePiastres: null, lineTotalPiastres: null });
  }
  return { document: cart, items, subtotalPiastres: checkedMoney(items.reduce((sum, item) => sum + (item.valid ? item.lineTotalPiastres : 0), 0)), quantity: items.reduce((sum, item) => sum + item.quantity, 0) };
}
export async function cartResponse(owner) {
  const quote = await quoteCart(owner);
  const items = quote.items.map(item => item.kind === 'gift_box_v2' ? publicGiftBoxCartLine(item) : item.valid ? publicCartLine(item) : item);
  const hasGifts = items.some(item => item.kind === 'gift_box_v2');
  const paths = await attachProductPaths(items.filter(item => item.kind === 'product' && item.slug).map(item => ({ _id: item.productId, slug: item.slug })));
  const byProduct = new Map(paths.map(product => [String(product._id), product.publicPath]));
  return { cart: { items: items.map(item => item.kind === 'product' && item.slug && byProduct.get(String(item.productId)) ? { ...item, publicPath: byProduct.get(String(item.productId)) } : item), subtotalPiastres: quote.subtotalPiastres, quantity: quote.quantity }, checkoutEnabled: env.checkoutEnabled === true && (!hasGifts || giftBoxRuntimeCommerceOpen(env) && items.every(item => item.valid && item.checkoutAllowed === true)), giftBoxCheckoutBlocked: hasGifts && (!giftBoxRuntimeCommerceOpen(env) || items.some(item => item.kind === 'gift_box_v2' && item.checkoutAllowed !== true)),
    // A UI scope identifier only, never an authorization credential or raw owner.
    checkoutOwnerKey: createHash('sha256').update(`checkout-context:${owner}`).digest('hex') };
}
async function changeCart(owner, operation) {
  assertUploadOwner(owner);
  for (let attempt = 0; attempt < 5; attempt += 1) {
    assertDatabaseWriteAllowed(Cart.db, env);
    try {
      await mongoose.connection.transaction(async session => {
        let cart = await Cart.findOne({ owner }).session(session);
        if (!cart) cart = new Cart({ owner, items: [], expiresAt: expiresAt() });
        if (cart.expiresAt < new Date()) { cart.items = []; cart.addOperations = []; }
        await operation(cart, session); cart.expiresAt = expiresAt();
        const referenced = cart.items.flatMap(item => [
          ...Object.values(item.personalization || {}), ...Object.values(item.customization?.fields || {})
        ].filter(Array.isArray).flat().concat(item.kind === 'gift_box_v2'
          ? (item.configuration?.personalizationIntent?.photoPrints || []).map(photo => photo.uploadId) : []));
        await detachUnusedCartUploads(cart._id, [...new Set(referenced)], owner, { session });
        assertDatabaseWriteAllowed(Cart.db, env); await cart.save({ session });
      }, { readConcern: { level: 'snapshot' } });
      return;
    }
    catch (error) {
      if ((error instanceof mongoose.Error.VersionError || error.code === 11000) && attempt < 4) continue;
      if (error.code === 20 || error.codeName === 'IllegalOperation') throw commerceError(503, 'TRANSACTIONS_REQUIRED', 'Cart changes require a transaction-capable dedicated database.');
      throw error;
    }
  }
}
const plainLine = line => typeof line.toObject === 'function' ? line.toObject() : line;
function storedLine(quote, id = randomUUID()) {
  return quote.kind === 'gift_box_v2'
    ? { id, kind: 'gift_box_v2', identity: quote.identity, configurationId: quote.configurationId, configuration: quote.configuration, name: quote.name, quantity: quote.quantity }
    : { id, kind: 'product', identity: quote.identity, productId: quote.productId, name: quote.name, slug: quote.slug, mainImageUrl: quote.mainImageUrl,
      variantKey: quote.variantKey, quantity: quote.quantity, personalization: quote.personalization, customization: quote.customization || null };
}
function sameLine(item, quote) {
  if (cartLineKind(item) !== quote.kind || item.identity !== quote.identity) return false;
  return quote.kind !== 'gift_box_v2' || item.configurationId === quote.configurationId && JSON.stringify(item.configuration) === JSON.stringify(quote.configuration);
}
async function validateGiftLines(lines, session, suppliedContext, owner, cartId) {
  const gifts = lines.filter(line => line.kind === 'gift_box_v2');
  if (!gifts.length) return;
  const context = suppliedContext || await createGiftBoxCartPricingContext(gifts, { session, owner, cartId });
  const quotes = gifts.map(line => quoteGiftBoxCartLine(plainLine(line), context));
  const failure = giftBoxCartStockErrors(quotes, context).values().next().value;
  if (failure) throw failure;
}
export async function addCartItem(owner, raw, { onAdded } = {}) {
  const input = cartItemInput.parse(raw);
  if (input.kind === 'gift_box_v2') input.configuration = identifyGiftBoxConfiguration(input.configuration).configuration;
  // Old Product operation receipts did not include a discriminator. Preserve
  // those request hashes while new gift receipts hash canonical configuration.
  const { kind, ...legacyProductInput } = input;
  const requestHash = fingerprint(kind === 'product' ? legacyProductInput : input);
  let added;
  await changeCart(owner, async (cart, session) => {
    added = null;
    if (input.operationKey) {
      const previous = cart.addOperations.find(entry => entry.key === input.operationKey);
      if (previous) {
        if (previous.requestHash !== requestHash) throw commerceError(409, 'CART_OPERATION_CONFLICT', 'This add request was already used for a different item. Review the cart.');
        return;
      }
      if (cart.addOperations.length >= 60) throw commerceError(409, 'CART_OPERATION_LIMIT', 'Review your cart before starting another personalization session.');
    }
    const giftContext = kind === 'gift_box_v2' ? await createGiftBoxCartPricingContext([...cart.items, input], { session, owner, cartId: cart._id }) : null;
    const quote = kind === 'gift_box_v2' ? quoteGiftBoxCartLine(input, giftContext, { stored: false }) : { ...await quoteCartLine(input, owner, { session }), kind: 'product' };
    added = { kind, ...(kind === 'product' ? { productId: quote.productId, slug: quote.slug } : {}), quantity: input.quantity, unitPricePiastres: quote.unitPricePiastres, customized: Boolean(quote.customization) };
    const existing = cart.items.find(item => sameLine(item, quote));
    if (existing) {
      const quantity = existing.quantity + input.quantity;
      cartQuantity.parse(quantity);
      if (kind === 'product') await quoteCartLine({ ...input, quantity }, owner, { session });
      existing.quantity = quantity;
    } else {
      if (cart.items.length >= 30) throw commerceError(400, 'CART_LIMIT', 'A cart can contain at most thirty items.');
      cart.items.push(storedLine(quote));
    }
    if (kind === 'gift_box_v2') await validateGiftLines(cart.items, session, giftContext, owner, cart._id);
    await attachUploadsToCart(quote.uploadIds, owner, cart._id, { session });
    if (input.operationKey) cart.addOperations.push({ key: input.operationKey, requestHash });
  });
  const response = await cartResponse(owner);
  // Cover parameter construction, path lookup and callback execution, not just
  // provider dispatch. Optional tracking cannot reverse an acknowledged write.
  if (onAdded && added) { try { response.tracking = await onAdded(added); } catch { response.tracking = null; } }
  return response;
}
export async function updateCartQuantity(owner, id, quantity) {
  cartQuantity.parse(quantity);
  await changeCart(owner, async (cart, session) => {
    const item = cart.items.find(line => line.id === id);
    if (!item) throw commerceError(404, 'CART_ITEM_NOT_FOUND', 'Cart item not found.');
    const kind = cartLineKind(item);
    const quote = kind === 'gift_box_v2' ? null : await quoteCartLine({ ...item.toObject(), quantity }, owner, { session }); item.quantity = quantity;
    if (kind === 'gift_box_v2') await validateGiftLines(cart.items, session, null, owner, cart._id);
    if (quote) await attachUploadsToCart(quote.uploadIds, owner, cart._id, { session });
  });
  return cartResponse(owner);
}
export async function removeCartItem(owner, id) {
  await changeCart(owner, cart => { cart.items = cart.items.filter(item => item.id !== id); });
  return cartResponse(owner);
}
export async function clearCart(owner) {
  assertUploadOwner(owner);
  assertDatabaseWriteAllowed(Cart.db, env);
  await mongoose.connection.transaction(async session => {
    const cart = await Cart.findOne({ owner }).session(session);
    if (!cart) return;
    await detachUnusedCartUploads(cart._id, [], owner, { session });
    assertDatabaseWriteAllowed(Cart.db, env); await Cart.deleteOne({ _id: cart._id }, { session });
  });
  return cartResponse(owner);
}
export async function mergeGuestCart(fromOwner, toOwner) {
  assertUploadOwner(toOwner);
  if (!fromOwner || fromOwner === toOwner) return { ...await cartResponse(toOwner), skipped: 0 };
  if (!/^guest:[a-f0-9]{64}$/i.test(fromOwner) || !/^user:[a-f0-9]{24}$/i.test(toOwner)) throw commerceError(403, 'CART_MERGE_OWNER_INVALID', 'Merge only the current guest cart into the verified account.');
  let skipped = 0;
  assertDatabaseWriteAllowed(Cart.db, env);
  await mongoose.connection.transaction(async session => {
    skipped = 0;
    const source = await readCart(fromOwner, { session });
    if (!source) return;
    if (source.items.some(line => line.kind === 'gift_box_v2' && line.configuration?.personalizationIntent))
      throw commerceError(409, 'GIFT_BOX_PERSONALIZATION_MERGE_PENDING', 'Complete this personalized gift as a guest or remove it before signing in. The original cart remains unchanged.');
    let target = await Cart.findOne({ owner: toOwner }).session(session);
    if (!target) target = new Cart({ owner: toOwner, items: [], expiresAt: expiresAt() });
    if (target.expiresAt < new Date()) { target.items = []; target.addOperations = []; }
    if (target.items.some(line => line.kind === 'gift_box_v2' && line.configuration?.personalizationIntent))
      throw commerceError(409, 'GIFT_BOX_PERSONALIZATION_MERGE_PENDING', 'Personalized gift attachments need review before merging carts. Both carts remain unchanged.');
    const receipts = new Map(target.addOperations.map(entry => [entry.key, entry.requestHash]));
    for (const receipt of source.addOperations || []) {
      // Historical receipts have no per-line provenance, so even equal hashes
      // cannot justify summing two lines that may represent the same add.
      if (receipts.has(receipt.key)) throw commerceError(409, 'CART_OPERATION_CONFLICT', 'An add operation already exists in both carts. Review both carts before combining them.');
      receipts.set(receipt.key, receipt.requestHash);
    }
    if (receipts.size > 60) throw commerceError(409, 'CART_OPERATION_LIMIT', 'Review your carts before combining more add operations.');
    const giftContext = await createGiftBoxCartPricingContext([...source.items, ...target.items], { session });
    const transferredUploads = new Set();
    for (const item of source.items) {
      let quote;
      try { quote = cartLineKind(item) === 'gift_box_v2' ? quoteGiftBoxCartLine(item, giftContext) : { ...await quoteCartLine(item, fromOwner, { session }), kind: 'product' }; }
      catch (caught) { const error = giftCartError(caught); if (!error.status || error.status >= 500) throw error; skipped += 1; continue; }
      const existing = target.items.find(line => sameLine(line, quote));
      if ((!existing && target.items.length >= 30) || (existing && existing.quantity + item.quantity > 99)) { skipped += 1; continue; }
      try {
        if (quote.kind === 'gift_box_v2') {
          const proposed = target.items.map(plainLine);
          if (existing) proposed.find(line => line.id === existing.id).quantity += item.quantity;
          else proposed.push(storedLine(quote, item.id));
          await validateGiftLines(proposed, session, giftContext);
        } else if (existing) await quoteCartLine({ ...item, quantity: existing.quantity + item.quantity }, fromOwner, { session });
      } catch (caught) { const error = giftCartError(caught); if (!error.status || error.status >= 500) throw error; skipped += 1; continue; }
      if (existing) {
        existing.quantity += item.quantity;
      } else target.items.push(quote.kind === 'gift_box_v2' ? storedLine(quote, item.id) : item);
      quote.uploadIds.forEach(id => transferredUploads.add(id));
    }
    await transferUploadOwnership([...transferredUploads], fromOwner, toOwner, { session });
    await attachUploadsToCart([...transferredUploads], toOwner, target._id, { session });
    target.expiresAt = expiresAt();
    target.addOperations = [...receipts].map(([key, requestHash]) => ({ key, requestHash }));
    assertDatabaseWriteAllowed(Cart.db, env); await target.save({ session });
    assertDatabaseWriteAllowed(Cart.db, env); await Cart.deleteOne({ _id: source._id }, { session });
  }, { readConcern: { level: 'snapshot' } });
  return { ...await cartResponse(toOwner), skipped };
}
