import {
  asyncHandler
} from "../utils/asyncHandler.js";

import {
  createHttpError
} from "../utils/httpError.js";

import {
  calculateOrderBaseTotals,
  normalizeOrderItems
} from "../services/orderPricing.service.js";

import {
  validateAndCalculateDiscount
} from "../services/discount.service.js";

import {
  validateDiscountSchema
} from "../validators/discount.validator.js";

export const validateDiscountCode =
  asyncHandler(async (req, res) => {
    const validation =
      validateDiscountSchema.safeParse(
        req.body
      );

    if (!validation.success) {
      throw createHttpError(
        400,
        "Invalid discount information",
        validation.error.flatten()
      );
    }

    const payload =
      validation.data;

    const normalizedItems =
      await normalizeOrderItems({
        requestedItems:
          payload.items
      });

    const {
      subtotal,
      shippingFee
    } =
      calculateOrderBaseTotals({
        normalizedItems,

        governorate:
          payload.shippingAddress
            .governorate
      });

    const result =
      await validateAndCalculateDiscount(
        {
          code: payload.code,
          normalizedItems,
          subtotal,
          shippingFee,

          customerEmail:
            payload.customerEmail,

          reserve: false
        }
      );

    res.status(200).json({
      success: true,
      message:
        "Discount code applied successfully",

      discount:
        result.discount,

      totals: {
        subtotal,
        shippingFee,

        discount:
          result.totalDiscount,

        grandTotal:
          result.grandTotal
      }
    });
  });