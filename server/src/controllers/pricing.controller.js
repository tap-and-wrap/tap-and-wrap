import { asyncHandler } from "../utils/asyncHandler.js";
import { createHttpError } from "../utils/httpError.js";
import { calculateOrderPricing } from "../services/pricing.service.js";
import { previewPricingSchema } from "../validators/pricing.validator.js";

export const previewOrderPricing = asyncHandler(async (req, res) => {
  const validation = previewPricingSchema.safeParse(req.body);

  if (!validation.success) {
    throw createHttpError(
      400,
      "Invalid pricing information",
      validation.error.flatten()
    );
  }

  const payload = validation.data;

  const pricing = await calculateOrderPricing({
    requestedItems: payload.items,
    governorate: payload.shippingAddress.governorate,
    discountCode: payload.discountCode,
    customerEmail: payload.customerEmail,
    softFailDiscount: true
  });

  res.status(200).json({
    success: true,
    offers: pricing.offers,
    discount: pricing.discount,
    discountError: pricing.discountError,
    totals: pricing.totals
  });
});
