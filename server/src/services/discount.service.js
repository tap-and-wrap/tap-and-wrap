import DiscountCode from "../models/DiscountCode.js";
import Order from "../models/Order.js";

import { createHttpError } from "../utils/httpError.js";

function normalizeCode(value) {
  return String(value || "")
    .trim()
    .toUpperCase()
    .replace(/\s+/g, "");
}

function roundMoney(value) {
  return Math.round(Number(value || 0) * 100) / 100;
}

function applySession(query, session) {
  if (session) {
    query.session(session);
  }

  return query;
}

function getDiscountableLineTotal(item) {
  if (
    item.discountableLineTotal !== undefined &&
    item.discountableLineTotal !== null
  ) {
    return Number(item.discountableLineTotal || 0);
  }

  return Number(item.lineTotal || 0);
}

function getEligibleSubtotal(discount, items) {
  if (discount.scope === "all_products") {
    return items.reduce(
      (total, item) => total + getDiscountableLineTotal(item),
      0
    );
  }

  if (discount.scope === "selected_products") {
    const selectedProducts = new Set(
      (discount.products || []).map((value) =>
        String(value?._id || value)
      )
    );

    return items.reduce((total, item) => {
      const isEligible = selectedProducts.has(String(item.product));

      return total + (isEligible ? getDiscountableLineTotal(item) : 0);
    }, 0);
  }

  const selectedCategories = new Set(
    (discount.categories || []).map((value) =>
      String(value?._id || value)
    )
  );

  return items.reduce((total, item) => {
    const categoryId = String(item.category || "");
    const subcategoryId = String(item.subcategory || "");

    const isEligible =
      selectedCategories.has(categoryId) ||
      selectedCategories.has(subcategoryId);

    return total + (isEligible ? getDiscountableLineTotal(item) : 0);
  }, 0);
}

async function validateCustomerUsage({
  discount,
  customerEmail,
  session
}) {
  if (
    discount.usageLimitPerCustomer === null ||
    discount.usageLimitPerCustomer === undefined
  ) {
    return;
  }

  const normalizedEmail = String(customerEmail || "")
    .trim()
    .toLowerCase();

  if (!normalizedEmail) {
    return;
  }

  const usageCount = await applySession(
    Order.countDocuments({
      "discount.discountCode": discount._id,
      "customer.email": normalizedEmail,
      status: {
        $ne: "cancelled"
      }
    }),
    session
  );

  if (usageCount >= discount.usageLimitPerCustomer) {
    throw createHttpError(
      409,
      "This discount code has already reached its usage limit for this customer"
    );
  }
}

async function reserveUsage({ discount, session }) {
  const filter = {
    _id: discount._id,
    isActive: true
  };

  if (
    discount.usageLimit !== null &&
    discount.usageLimit !== undefined
  ) {
    filter.usedCount = {
      $lt: discount.usageLimit
    };
  }

  const options = {
    returnDocument: "after"
  };

  if (session) {
    options.session = session;
  }

  const updatedDiscount = await DiscountCode.findOneAndUpdate(
    filter,
    {
      $inc: {
        usedCount: 1
      }
    },
    options
  );

  if (!updatedDiscount) {
    throw createHttpError(
      409,
      "This discount code has reached its total usage limit"
    );
  }
}

export async function validateAndCalculateDiscount({
  code,
  normalizedItems,
  subtotal,
  minimumSubtotalBase = subtotal,
  shippingFee,
  customerEmail = "",
  session = null,
  reserve = false
}) {
  const normalizedCode = normalizeCode(code);

  if (!normalizedCode) {
    return {
      applied: false,
      discount: null,
      eligibleSubtotal: 0,
      merchandiseDiscount: 0,
      shippingDiscount: 0,
      totalDiscount: 0,
      grandTotal: roundMoney(subtotal + shippingFee)
    };
  }

  const discount = await applySession(
    DiscountCode.findOne({
      code: normalizedCode
    }),
    session
  );

  if (!discount) {
    throw createHttpError(404, "Discount code was not found");
  }

  if (!discount.isActive) {
    throw createHttpError(400, "This discount code is inactive");
  }

  const now = new Date();

  if (discount.startsAt && discount.startsAt > now) {
    throw createHttpError(400, "This discount code is not active yet");
  }

  if (discount.endsAt && discount.endsAt < now) {
    throw createHttpError(400, "This discount code has expired");
  }

  if (
    discount.usageLimit !== null &&
    discount.usedCount >= discount.usageLimit
  ) {
    throw createHttpError(
      409,
      "This discount code has reached its usage limit"
    );
  }

  if (
    Number(minimumSubtotalBase || 0) <
    Number(discount.minimumSubtotal || 0)
  ) {
    throw createHttpError(
      400,
      `This code requires a minimum subtotal of ${discount.minimumSubtotal} EGP`
    );
  }

  await validateCustomerUsage({
    discount,
    customerEmail,
    session
  });

  const eligibleSubtotal = roundMoney(
    getEligibleSubtotal(discount, normalizedItems)
  );

  if (discount.scope !== "all_products" && eligibleSubtotal <= 0) {
    throw createHttpError(
      400,
      "This discount does not apply to the products in your cart"
    );
  }

  let merchandiseDiscount = 0;
  let shippingDiscount = 0;

  if (discount.type === "percentage") {
    merchandiseDiscount =
      eligibleSubtotal * (Number(discount.value) / 100);
  }

  if (discount.type === "fixed") {
    merchandiseDiscount = Math.min(
      Number(discount.value),
      eligibleSubtotal
    );
  }

  if (
    discount.maximumDiscount !== null &&
    discount.maximumDiscount !== undefined &&
    discount.type !== "free_shipping"
  ) {
    merchandiseDiscount = Math.min(
      merchandiseDiscount,
      Number(discount.maximumDiscount)
    );
  }

  if (discount.type === "free_shipping") {
    shippingDiscount = Number(shippingFee || 0);
  }

  merchandiseDiscount = roundMoney(
    Math.min(merchandiseDiscount, subtotal)
  );

  shippingDiscount = roundMoney(
    Math.min(shippingDiscount, shippingFee)
  );

  const totalDiscount = roundMoney(
    merchandiseDiscount + shippingDiscount
  );

  const grandTotal = roundMoney(
    Math.max(subtotal + shippingFee - totalDiscount, 0)
  );

  if (reserve) {
    await reserveUsage({
      discount,
      session
    });
  }

  return {
    applied: true,
    eligibleSubtotal,
    merchandiseDiscount,
    shippingDiscount,
    totalDiscount,
    grandTotal,

    discount: {
      discountCode: discount._id,
      code: discount.code,
      name: discount.name,
      type: discount.type,
      value: discount.value,
      scope: discount.scope,
      minimumSubtotal: discount.minimumSubtotal,
      merchandiseDiscount,
      shippingDiscount,
      amount: totalDiscount
    }
  };
}
