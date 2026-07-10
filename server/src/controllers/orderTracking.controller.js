import Order from "../models/Order.js";

import {
  asyncHandler
} from "../utils/asyncHandler.js";

import {
  createHttpError
} from "../utils/httpError.js";

import {
  trackOrderSchema
} from "../validators/orderTracking.validator.js";

function sanitizeStatusHistory(
  history = []
) {
  return history.map((entry) => ({
    status: entry.to,
    changedAt: entry.changedAt
  }));
}

function sanitizeEngraving(
  engraving = {}
) {
  if (!engraving.enabled) {
    return {
      enabled: false
    };
  }

  return {
    enabled: true,
    type: engraving.type,
    text:
      engraving.type === "text"
        ? engraving.text || ""
        : "",
    placement:
      engraving.placement || "",
    hasUploadedImage:
      engraving.type === "image"
  };
}

function sanitizeWrapping(
  wrapping = {}
) {
  if (!wrapping.enabled) {
    return {
      enabled: false
    };
  }

  return {
    enabled: true,
    boxColor:
      wrapping.boxColor || "",
    ribbonColor:
      wrapping.ribbonColor || "",
    giftCard:
      Boolean(wrapping.giftCard),
    giftCardMessage:
      wrapping.giftCard
        ? wrapping.giftCardMessage ||
          ""
        : "",
    textOnBox:
      Boolean(wrapping.textOnBox),
    boxText:
      wrapping.textOnBox
        ? wrapping.boxText || ""
        : "",
    fillers:
      Boolean(wrapping.fillers)
  };
}

function sanitizeOffers(
  offers = []
) {
  return offers.map((offer) => ({
    name:
      offer.name ||
      "Bundle offer",

    applications:
      Number(
        offer.applications || 1
      ),

    merchandiseDiscount:
      Number(
        offer.merchandiseDiscount ||
          0
      ),

    shippingDiscount:
      Number(
        offer.shippingDiscount || 0
      )
  }));
}

export const trackOrder =
  asyncHandler(async (req, res) => {
    const validation =
      trackOrderSchema.safeParse(
        req.body
      );

    if (!validation.success) {
      throw createHttpError(
        400,
        "Invalid tracking information",
        validation.error.flatten()
      );
    }

    const {
      orderNumber,
      email
    } = validation.data;

    const order = await Order.findOne({
      orderNumber,

      "customer.email":
        email
    })
      .select(
        [
          "orderNumber",
          "status",
          "statusHistory",
          "createdAt",
          "updatedAt",
          "items",
          "totals",
          "discount",
          "offers",
          "payment.method",
          "payment.status",
          "shippingAddress.governorate",
          "shippingAddress.city",
          "shippingAddress.area"
        ].join(" ")
      )
      .lean();

    if (!order) {
      throw createHttpError(
        404,
        "We could not find an order matching that number and email"
      );
    }

    const items = (
      order.items || []
    ).map((item) => ({
      _id: item._id,

      productName:
        item.productName,

      productSlug:
        item.productSlug,

      productImage:
        item.productImage || "",

      quantity:
        item.quantity,

      productUnitPrice:
        item.productUnitPrice,

      unitTotal:
        item.unitTotal,

      lineTotal:
        item.lineTotal,

      engraving:
        sanitizeEngraving(
          item.engraving
        ),

      wrapping:
        sanitizeWrapping(
          item.wrapping
        )
    }));

    const discount =
      order.discount?.code
        ? {
            code:
              order.discount.code,

            name:
              order.discount.name,

            amount:
              Number(
                order.discount
                  .amount || 0
              )
          }
        : null;

    res.status(200).json({
      success: true,

      order: {
        orderNumber:
          order.orderNumber,

        status:
          order.status,

        createdAt:
          order.createdAt,

        updatedAt:
          order.updatedAt,

        payment: {
          method:
            order.payment?.method,

          status:
            order.payment?.status
        },

        shippingDestination: {
          governorate:
            order.shippingAddress
              ?.governorate || "",

          city:
            order.shippingAddress
              ?.city || "",

          area:
            order.shippingAddress
              ?.area || ""
        },

        items,

        totals:
          order.totals,

        discount,

        offers:
          sanitizeOffers(
            order.offers || []
          ),

        statusHistory:
          sanitizeStatusHistory(
            order.statusHistory ||
              []
          )
      }
    });
  });