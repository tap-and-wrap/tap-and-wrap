import {
  calculateOrderBaseTotals,
  normalizeOrderItems
} from "./orderPricing.service.js";
import {
  calculateBundleOffers,
  recordBundleOfferUsage
} from "./bundleOffer.service.js";
import {
  validateAndCalculateDiscount
} from "./discount.service.js";
import { createHttpError } from "../utils/httpError.js";

function roundMoney(value) {
  return Math.round(Number(value || 0) * 100) / 100;
}

function canSoftFailDiscount(error) {
  return [400, 404, 409].includes(Number(error?.statusCode || 0));
}

export async function calculateOrderPricing({
  requestedItems,
  governorate = "",
  discountCode = "",
  customerEmail = "",
  session = null,
  reserveDiscount = false,
  reserveOffers = false,
  softFailDiscount = false
}) {
  const normalizedItems = await normalizeOrderItems({
    requestedItems,
    session
  });

  const { subtotal, shippingFee } = calculateOrderBaseTotals({
    normalizedItems,
    governorate
  });

  const bundleResult = await calculateBundleOffers({
    normalizedItems,
    shippingFee,
    session
  });

  let discountResult;
  let discountError = "";

  try {
    discountResult = await validateAndCalculateDiscount({
      code: discountCode,
      normalizedItems: bundleResult.adjustedItems,
      subtotal: bundleResult.subtotalAfterOffers,
      minimumSubtotalBase: subtotal,
      shippingFee: bundleResult.shippingAfterOffers,
      customerEmail,
      session,
      reserve: Boolean(discountCode) && reserveDiscount
    });

    if (
      discountCode &&
      discountResult.applied &&
      discountResult.totalDiscount <= 0 &&
      governorate
    ) {
      throw createHttpError(
        400,
        "This discount code does not provide an additional discount for this order"
      );
    }
  } catch (error) {
    if (!softFailDiscount || !canSoftFailDiscount(error)) {
      throw error;
    }

    discountError = error.message;

    discountResult = await validateAndCalculateDiscount({
      code: "",
      normalizedItems: bundleResult.adjustedItems,
      subtotal: bundleResult.subtotalAfterOffers,
      minimumSubtotalBase: subtotal,
      shippingFee: bundleResult.shippingAfterOffers,
      customerEmail,
      session,
      reserve: false
    });
  }

  if (reserveOffers && bundleResult.appliedOffers.length) {
    await recordBundleOfferUsage({
      appliedOffers: bundleResult.appliedOffers,
      session
    });
  }

  const offerDiscount = roundMoney(bundleResult.totalDiscount);
  const codeDiscount = roundMoney(discountResult.totalDiscount);
  const totalDiscount = roundMoney(offerDiscount + codeDiscount);
  const grandTotal = roundMoney(
    Math.max(subtotal + shippingFee - totalDiscount, 0)
  );

  const itemsForOrder = bundleResult.adjustedItems.map((item) => ({
    product: item.product,
    category: item.category,
    subcategory: item.subcategory,
    productName: item.productName,
    productSlug: item.productSlug,
    productImage: item.productImage,
    sku: item.sku,
    quantity: item.quantity,
    productUnitPrice: item.productUnitPrice,
    engraving: item.engraving,
    wrapping: item.wrapping,
    offerDiscount: item.offerDiscount,
    unitTotal: item.unitTotal,
    lineTotal: item.lineTotal
  }));

  return {
    normalizedItems: itemsForOrder,
    offers: bundleResult.appliedOffers,
    discount: discountResult.discount,
    discountError,
    totals: {
      subtotal: roundMoney(subtotal),
      shippingFee: roundMoney(shippingFee),
      offerDiscount,
      codeDiscount,
      discount: totalDiscount,
      grandTotal
    }
  };
}
