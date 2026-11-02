import mongoose from 'mongoose';
import DiscountCode from '../models/DiscountCode.js';
import BundleRule from '../models/BundleRule.js';
import { DiscountRedemption } from '../models/DiscountRedemption.js';
import { configurationError } from './customization.js';
import { env } from '../config/env.js';
import { assertDatabaseWriteAllowed } from '../config/database-safety.js';
import { cartLineKind } from './cart-contract.js';

export const GOVERNORATES = Object.freeze([
  { id: 'cairo', name: 'Cairo' }, { id: 'giza', name: 'Giza' },
  { id: 'alexandria', name: 'Alexandria' }, { id: 'aswan', name: 'Aswan' },
  { id: 'asyut', name: 'Asyut' }, { id: 'beheira', name: 'Beheira' },
  { id: 'beni_suef', name: 'Beni Suef' }, { id: 'dakahlia', name: 'Dakahlia' },
  { id: 'damietta', name: 'Damietta' }, { id: 'faiyum', name: 'Faiyum' },
  { id: 'gharbia', name: 'Gharbia' }, { id: 'ismailia', name: 'Ismailia' },
  { id: 'kafr_el_sheikh', name: 'Kafr El Sheikh' }, { id: 'luxor', name: 'Luxor' },
  { id: 'matruh', name: 'Matruh' }, { id: 'minya', name: 'Minya' },
  { id: 'monufia', name: 'Monufia' }, { id: 'new_valley', name: 'New Valley' },
  { id: 'north_sinai', name: 'North Sinai' }, { id: 'port_said', name: 'Port Said' },
  { id: 'qalyubia', name: 'Qalyubia' }, { id: 'qena', name: 'Qena' },
  { id: 'red_sea', name: 'Red Sea' }, { id: 'sharqia', name: 'Sharqia' },
  { id: 'sohag', name: 'Sohag' }, { id: 'south_sinai', name: 'South Sinai' },
  { id: 'suez', name: 'Suez' }
].map((value) => Object.freeze(value)));

export function shippingForGovernorate(governorate) {
  if (!GOVERNORATES.some(area => area.id === governorate)) throw configurationError('Choose a supported Egyptian governorate.', 'GOVERNORATE_INVALID');
  return { governorate, status: 'pending_confirmation', shippingPiastres: null };
}
export async function getShippingQuote(governorate) { return shippingForGovernorate(governorate); }
export async function lockShippingQuote() { throw configurationError('Delivery fees require order-specific customer acceptance.', 'SHIPPING_POLICY_CHANGED', 409); }

function validDates(rule, now) {
  return rule.active && (!rule.startsAt || new Date(rule.startsAt) <= now) && (!rule.endsAt || new Date(rule.endsAt) > now);
}
function safeSum(a, b) {
  const total = a + b;
  if (!Number.isSafeInteger(total)) throw configurationError('The cart total exceeds supported limits.', 'PRICING_INVALID');
  return total;
}
const percentage = (amount, basisPoints) => Number(BigInt(amount) * BigInt(basisPoints) / 10000n);
function configuredDiscount(amount, kind, value) {
  if (!Number.isSafeInteger(value) || value <= 0 || !['fixed', 'percentage'].includes(kind) || (kind === 'percentage' && value > 10000)) throw configurationError('A promotion configuration is invalid.', 'PROMOTION_UNAVAILABLE', 409);
  return Math.min(amount, kind === 'percentage' ? percentage(amount, value) : value);
}

export function evaluatePromotions(lines, rules = [], discount = null, { userId = null, now = new Date(), customerRedemptionCount = 0 } = {}) {
  if (!Array.isArray(lines) || lines.length > 100) throw configurationError('A bounded cart is required.', 'PRICING_INVALID');
  let subtotalPiastres = 0, productSubtotalPiastres = 0;
  const available = lines.map((line, index) => {
    const kind = cartLineKind(line);
    if (!Number.isSafeInteger(line.quantity) || line.quantity < 1 || line.quantity > 99 || !Number.isSafeInteger(line.unitPricePiastres) || line.unitPricePiastres < 0 || (line.lineTotalPiastres !== undefined && line.lineTotalPiastres !== line.quantity * line.unitPricePiastres)) throw configurationError('The cart contains invalid prices or quantities.', 'PRICING_INVALID');
    subtotalPiastres = safeSum(subtotalPiastres, line.quantity * line.unitPricePiastres);
    if (kind === 'gift_box_v2') return null;
    productSubtotalPiastres = safeSum(productSubtotalPiastres, line.quantity * line.unitPricePiastres);
    return { line, index, remaining: line.quantity, bundledDiscount: 0 };
  }).filter(Boolean);
  let discountPiastres = 0;
  const applied = [];
  const sortedRules = rules.filter((rule) => validDates(rule, now)).sort((a, b) => a.priority - b.priority || String(a._id).localeCompare(String(b._id)));
  for (const rule of sortedRules) {
    let applications = 0;
    let ruleDiscount = 0;
    while (applications < rule.maxApplications) {
      const allocation = [];
      // Allocate specific variants before wildcard entries so a wildcard cannot
      // consume the only unit that satisfies a later variant requirement.
      const orderedItems = [...rule.items].sort((a, b) => Number(a.variantKey == null) - Number(b.variantKey == null));
      for (const item of orderedItems) {
        let needed = item.quantity;
        const matches = available.filter(({ line }) => String(line.productId) === String(item.productId) && (item.variantKey == null || (line.variantKey ?? null) === item.variantKey)).sort((a, b) => a.line.unitPricePiastres - b.line.unitPricePiastres || a.index - b.index);
        for (const match of matches) {
          const alreadyAllocated = allocation.filter((entry) => entry.match === match).reduce((total, entry) => total + entry.quantity, 0);
          const quantity = Math.min(needed, match.remaining - alreadyAllocated);
          if (quantity > 0) allocation.push({ match, quantity });
          needed -= quantity;
          if (!needed) break;
        }
        if (needed) break;
      }
      if (allocation.reduce((total, entry) => total + entry.quantity, 0) !== rule.items.reduce((total, item) => total + item.quantity, 0)) break;
      const bundleValue = allocation.reduce((total, entry) => safeSum(total, entry.match.line.unitPricePiastres * entry.quantity), 0);
      if (bundleValue === 0) break;
      const amount = configuredDiscount(bundleValue, rule.discountKind, rule.discountValue);
      let remainingDiscount = amount;
      for (let index = 0; index < allocation.length; index += 1) {
        const entry = allocation[index];
        const share = index === allocation.length - 1 ? remainingDiscount : Number(BigInt(amount) * BigInt(entry.match.line.unitPricePiastres * entry.quantity) / BigInt(bundleValue));
        entry.match.remaining -= entry.quantity;
        entry.match.bundledDiscount += share;
        remainingDiscount -= share;
      }
      applications += 1;
      ruleDiscount = safeSum(ruleDiscount, amount);
    }
    if (applications) {
      discountPiastres = safeSum(discountPiastres, ruleDiscount);
      applied.push({ kind: 'bundle', id: String(rule._id), name: rule.name, applications, discountPiastres: ruleDiscount });
    }
  }
  if (discount) {
    if (!validDates(discount, now) || (discount.usageLimit !== null && discount.usageLimit !== undefined && discount.usedCount >= discount.usageLimit)) throw configurationError('This discount code is not available.', 'DISCOUNT_UNAVAILABLE', 409);
    if (discount.authenticatedOnly && !userId) throw configurationError('Sign in to use this discount code.', 'DISCOUNT_ACCOUNT_REQUIRED', 409);
    if (discount.perCustomerLimit && customerRedemptionCount >= discount.perCustomerLimit) throw configurationError('Your discount-code usage limit has been reached.', 'DISCOUNT_UNAVAILABLE', 409);
    if (productSubtotalPiastres < discount.minimumSubtotalPiastres) throw configurationError('The cart does not meet this code’s minimum subtotal.', 'DISCOUNT_MINIMUM', 409);
    if (applied.length && !discount.stackWithBundles) throw configurationError('This code cannot be combined with an applied bundle.', 'DISCOUNT_STACKING', 409);
    const eligible = available.filter(({ line }) => (!discount.productIds?.length && !discount.categoryIds?.length) || discount.productIds?.some((id) => String(id) === String(line.productId)) || discount.categoryIds?.some((id) => [line.categoryId, line.subcategoryId, ...(line.categoryIds || [])].filter(Boolean).some((categoryId) => String(categoryId) === String(id))));
    const eligibleSubtotal = eligible.reduce((total, entry) => safeSum(total, entry.line.quantity * entry.line.unitPricePiastres - entry.bundledDiscount), 0);
    if (!eligibleSubtotal) throw configurationError('This code does not apply to the current cart.', 'DISCOUNT_INELIGIBLE', 409);
    let amount = configuredDiscount(eligibleSubtotal, discount.kind, discount.value);
    if (discount.maximumDiscountPiastres !== null && discount.maximumDiscountPiastres !== undefined) amount = Math.min(amount, discount.maximumDiscountPiastres);
    discountPiastres = safeSum(discountPiastres, amount);
    applied.push({ kind: 'discount', id: String(discount._id), name: discount.name, code: discount.code, discountPiastres: amount });
  }
  discountPiastres = Math.min(productSubtotalPiastres, discountPiastres);
  return { subtotalPiastres, discountPiastres, totalPiastres: subtotalPiastres - discountPiastres, applied };
}

export async function calculatePromotions(lines, { code, session, userId, customerRedemptionCount = 0, now = new Date() } = {}) {
  const ids = [...new Set(lines.filter(line => cartLineKind(line) === 'product').map((line) => line.productId))];
  let bundleQuery = BundleRule.find({ active: true, 'items.productId': { $in: ids } }).sort({ priority: 1, _id: 1 }).limit(101).lean().maxTimeMS(3000);
  if (session) bundleQuery = bundleQuery.session(session);
  const rules = await bundleQuery;
  if (rules.length > 100) throw configurationError('Too many active promotion rules.', 'PROMOTION_UNAVAILABLE', 409);
  let discount = null;
  if (code !== undefined && code !== null && code !== '') {
    if (typeof code !== 'string' || !/^[A-Z0-9][A-Z0-9_-]{2,39}$/i.test(code.trim())) throw configurationError('Enter a valid discount code.', 'DISCOUNT_INVALID');
    let query = DiscountCode.findOne({ code: code.trim().toUpperCase() }).lean().maxTimeMS(3000);
    if (session) query = query.session(session);
    discount = await query;
    if (!discount) throw configurationError('This discount code is not available.', 'DISCOUNT_UNAVAILABLE', 409);
    if (userId && discount.perCustomerLimit) {
      let redemptions = DiscountRedemption.countDocuments({ discountId: discount._id, userId, reversedAt: null }).maxTimeMS(3000);
      if (session) redemptions = redemptions.session(session);
      customerRedemptionCount = await redemptions;
    }
  }
  return evaluatePromotions(lines, rules, discount, { userId, now, customerRedemptionCount });
}

export async function claimDiscountRedemption(discountId, { session, userId, redemptionCount = 0, now = new Date() } = {}) {
  if (!session?.inTransaction?.()) throw configurationError('Discount claims require the order transaction.', 'CHECKOUT_TRANSACTION_REQUIRED', 503);
  assertDatabaseWriteAllowed(mongoose.connection, env);
  const discount = await DiscountCode.findById(discountId).session(session).lean().maxTimeMS(3000);
  if (!discount || !validDates(discount, now) || (discount.authenticatedOnly && !userId) || (discount.perCustomerLimit && redemptionCount >= discount.perCustomerLimit)) throw configurationError('This discount code is no longer available.', 'DISCOUNT_UNAVAILABLE', 409);
  const filter = { _id: discountId, active: true, usedCount: { $lt: discount.usageLimit ?? 1000000 }, $and: [{ $or: [{ startsAt: null }, { startsAt: { $lte: now } }] }, { $or: [{ endsAt: null }, { endsAt: { $gt: now } }] }] };
  assertDatabaseWriteAllowed(mongoose.connection, env);
  // A new redemption invalidates merchant forms holding older usage/eligibility
  // information, while remaining atomic with the order and usage-limit claim.
  const claimed = await DiscountCode.findOneAndUpdate(filter, { $inc: { usedCount: 1, __v: 1 } }, { session, new: true }).lean().maxTimeMS(3000);
  if (!claimed) throw configurationError('This discount code’s usage limit has been reached.', 'DISCOUNT_UNAVAILABLE', 409);
  return claimed;
}
