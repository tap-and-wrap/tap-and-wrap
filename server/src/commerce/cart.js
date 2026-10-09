import { createHash, randomUUID } from 'node:crypto';
import mongoose from 'mongoose';
import { Cart } from '../models/Cart.js';
import { env } from '../config/env.js';
import { assertDatabaseWriteAllowed } from '../config/database-safety.js';
import { quoteCartLine, publicCartLine } from './pricing.js';
import { createPricingContext } from './pricing-context.js';
import { transferUploadOwnership, attachUploadsToCart, detachUnusedCartUploads } from './uploads.js';
import { commerceError, checkedMoney } from './errors.js';

const expiresAt = () => new Date(Date.now() + 30 * 86400000);
export async function readCart(owner, { session } = {}) {
  return Cart.findOne({ owner, expiresAt: { $gt: new Date() } }).session(session || null).lean().maxTimeMS(3000);
}
export async function quoteCart(owner, { session, strict = false } = {}) {
  const cart = await readCart(owner, { session });
  const context = await createPricingContext(cart?.items || [], owner, { session });
  const items = [];
  for (const item of cart?.items || []) {
    try {
      const quoted = await quoteCartLine(item, owner, { session, context });
      const expiries = quoted.uploadIds.map(id => context.uploads.get(String(id))?.expiresAt).filter(Boolean);
      items.push({ ...quoted, ...(expiries.length ? { attachments: { status: 'temporary', expiresAt: new Date(Math.min(...expiries.map(date => date.getTime()))), replacementRequired: false } } : {}) });
    }
    catch (error) {
      if (strict || !error.status || error.status >= 500) throw error;
      const uploadedFields = [...Object.entries(item.personalization || {}), ...Object.entries(item.customization?.fields || {})]
        .filter(([key, value]) => /^[a-z][a-z0-9_-]{0,79}$/i.test(key) && Array.isArray(value) && value.length > 0).map(([key]) => key);
      items.push({ id: item.id, productId: String(item.productId), name: item.name || 'Unavailable product', slug: item.slug || null, mainImageUrl: item.mainImageUrl || null, quantity: item.quantity, valid: false, error: error.message, errorCode: error.code || 'CART_ITEM_UNAVAILABLE',
        ...(error.code === 'INVALID_UPLOAD_REFERENCES' && uploadedFields.length ? { attachments: { status: 'unavailable', replacementRequired: true, fieldKeys: [...new Set(uploadedFields)], expiresAt: null } } : {}), unitPricePiastres: null, lineTotalPiastres: null });
    }
  }
  return { document: cart, items, subtotalPiastres: checkedMoney(items.reduce((sum, item) => sum + (item.valid ? item.lineTotalPiastres : 0), 0)), quantity: items.reduce((sum, item) => sum + item.quantity, 0) };
}
export async function cartResponse(owner) {
  const quote = await quoteCart(owner);
  return { cart: { items: quote.items.map(item => item.valid ? publicCartLine(item) : item), subtotalPiastres: quote.subtotalPiastres, quantity: quote.quantity }, checkoutEnabled: env.checkoutEnabled === true,
    // A UI scope identifier only, never an authorization credential or raw owner.
    checkoutOwnerKey: createHash('sha256').update(`checkout-context:${owner}`).digest('hex') };
}
async function changeCart(owner, operation) {
  for (let attempt = 0; attempt < 5; attempt += 1) {
    assertDatabaseWriteAllowed(Cart.db, env);
    try {
      await mongoose.connection.transaction(async session => {
        let cart = await Cart.findOne({ owner }).session(session);
        if (!cart) cart = new Cart({ owner, items: [], expiresAt: expiresAt() });
        if (cart.expiresAt < new Date()) cart.items = [];
        await operation(cart, session); cart.expiresAt = expiresAt();
        const referenced = cart.items.flatMap(item => [...Object.values(item.personalization || {}), ...Object.values(item.customization?.fields || {})].filter(Array.isArray).flat());
        await detachUnusedCartUploads(cart._id, [...new Set(referenced)], owner, { session });
        assertDatabaseWriteAllowed(Cart.db, env); await cart.save({ session });
      });
      return;
    }
    catch (error) {
      if ((error instanceof mongoose.Error.VersionError || error.code === 11000) && attempt < 4) continue;
      if (error.code === 20 || error.codeName === 'IllegalOperation') throw commerceError(503, 'TRANSACTIONS_REQUIRED', 'Cart changes require a transaction-capable dedicated database.');
      throw error;
    }
  }
}
export async function addCartItem(owner, input, { onAdded } = {}) {
  let added;
  await changeCart(owner, async (cart, session) => {
    const quote = await quoteCartLine(input, owner, { session });
    added = { productId: quote.productId, slug: quote.slug, quantity: input.quantity, unitPricePiastres: quote.unitPricePiastres, customized: Boolean(quote.customization) };
    const existing = cart.items.find(item => item.identity === quote.identity);
    if (existing) {
      const quantity = existing.quantity + input.quantity;
      await quoteCartLine({ ...input, quantity }, owner, { session });
      existing.quantity = quantity;
    } else {
      if (cart.items.length >= 30) throw commerceError(400, 'CART_LIMIT', 'A cart can contain at most thirty items.');
      cart.items.push({ id: randomUUID(), identity: quote.identity, productId: quote.productId, name: quote.name, slug: quote.slug, mainImageUrl: quote.mainImageUrl, variantKey: quote.variantKey, quantity: quote.quantity, personalization: quote.personalization, customization: quote.customization || null });
    }
    await attachUploadsToCart(quote.uploadIds, owner, cart._id, { session });
  });
  const response = await cartResponse(owner);
  if (onAdded) response.tracking = await onAdded(added);
  return response;
}
export async function updateCartQuantity(owner, id, quantity) {
  await changeCart(owner, async (cart, session) => {
    const item = cart.items.find(line => line.id === id);
    if (!item) throw commerceError(404, 'CART_ITEM_NOT_FOUND', 'Cart item not found.');
    const quote = await quoteCartLine({ ...item.toObject(), quantity }, owner, { session }); item.quantity = quantity;
    await attachUploadsToCart(quote.uploadIds, owner, cart._id, { session });
  });
  return cartResponse(owner);
}
export async function removeCartItem(owner, id) {
  await changeCart(owner, cart => { cart.items = cart.items.filter(item => item.id !== id); });
  return cartResponse(owner);
}
export async function clearCart(owner) {
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
  if (!fromOwner || fromOwner === toOwner) return { ...await cartResponse(toOwner), skipped: 0 };
  let skipped = 0;
  assertDatabaseWriteAllowed(Cart.db, env);
  await mongoose.connection.transaction(async session => {
    skipped = 0;
    const source = await readCart(fromOwner, { session });
    if (!source) return;
    let target = await Cart.findOne({ owner: toOwner }).session(session);
    if (!target) target = new Cart({ owner: toOwner, items: [], expiresAt: expiresAt() });
    if (target.expiresAt < new Date()) target.items = [];
    const transferredUploads = new Set();
    for (const item of source.items) {
      let quote;
      try { quote = await quoteCartLine(item, fromOwner, { session }); }
      catch (error) { if (!error.status || error.status >= 500) throw error; skipped += 1; continue; }
      const existing = target.items.find(line => line.identity === quote.identity);
      if ((!existing && target.items.length >= 30) || (existing && existing.quantity + item.quantity > 99)) { skipped += 1; continue; }
      if (existing) {
        try { await quoteCartLine({ ...item, quantity: existing.quantity + item.quantity }, fromOwner, { session }); }
        catch (error) { if (!error.status || error.status >= 500) throw error; skipped += 1; continue; }
        existing.quantity += item.quantity;
      } else target.items.push(item);
      quote.uploadIds.forEach(id => transferredUploads.add(id));
    }
    await transferUploadOwnership([...transferredUploads], fromOwner, toOwner, { session });
    await attachUploadsToCart([...transferredUploads], toOwner, target._id, { session });
    target.expiresAt = expiresAt();
    assertDatabaseWriteAllowed(Cart.db, env); await target.save({ session });
    assertDatabaseWriteAllowed(Cart.db, env); await Cart.deleteOne({ _id: source._id }, { session });
  });
  return { ...await cartResponse(toOwner), skipped };
}
