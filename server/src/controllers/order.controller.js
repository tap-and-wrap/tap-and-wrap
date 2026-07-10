import mongoose from "mongoose";

import Order from "../models/Order.js";

import {
  getPublicStoreConfig
} from "../config/storeConfig.js";

import {
  isTrustedCustomerUpload
} from "../config/uploadConfig.js";

import {
  asyncHandler
} from "../utils/asyncHandler.js";

import {
  createHttpError
} from "../utils/httpError.js";

import {
  generateOrderNumber
} from "../utils/orderNumber.js";

import {
  decrementStockForItems
} from "../services/orderPricing.service.js";

import {
  calculateOrderPricing
} from "../services/pricing.service.js";

import {
  queueOrderCreatedNotifications
} from "../services/notification.service.js";

import {
  initializeCardPayment
} from "./paymob.controller.js";

import {
  createOrderSchema
} from "../validators/order.validator.js";

function validatePaymentMethod(
  paymentMethod
) {
  const config =
    getPublicStoreConfig();

  const methods =
    config.paymentMethods;

  const availability = {
    cod:
      methods.cod.enabled,

    instapay:
      methods.instapay
        .enabled,

    vodafone_cash:
      methods.vodafoneCash
        .enabled,

    card:
      methods.card.enabled
  };

  if (
    !availability[
      paymentMethod
    ]
  ) {
    throw createHttpError(
      400,
      "The selected payment method is currently unavailable"
    );
  }
}

function buildPaymentProof(
  paymentMethod,
  requestedProof
) {
  const requiresProof =
    paymentMethod ===
      "instapay" ||
    paymentMethod ===
      "vodafone_cash";

  if (!requiresProof) {
    return {
      imageUrl: "",
      imagePublicId: ""
    };
  }

  if (
    !requestedProof?.imageUrl ||
    !requestedProof
      ?.imagePublicId
  ) {
    throw createHttpError(
      400,
      "Please upload the payment transfer screenshot"
    );
  }

  const trusted =
    isTrustedCustomerUpload(
      {
        imageUrl:
          requestedProof.imageUrl,

        imagePublicId:
          requestedProof
            .imagePublicId
      },

      "payment_proof"
    );

  if (!trusted) {
    throw createHttpError(
      400,
      "The payment proof image is invalid"
    );
  }

  return {
    imageUrl:
      requestedProof.imageUrl,

    imagePublicId:
      requestedProof
        .imagePublicId
  };
}

function serializeOrder(
  order
) {
  return {
    orderNumber:
      order.orderNumber,

    status:
      order.status,

    paymentMethod:
      order.payment.method,

    paymentStatus:
      order.payment.status,

    totals:
      order.totals,

    offers:
      order.offers.map(
        (offer) => ({
          name:
            offer.name,

          applications:
            offer.applications,

          merchandiseDiscount:
            offer.merchandiseDiscount,

          shippingDiscount:
            offer.shippingDiscount,

          freeShipping:
            offer.freeShipping
        })
      ),

    discount:
      order.discount?.code
        ? {
            code:
              order.discount.code,

            name:
              order.discount.name,

            amount:
              order.discount.amount
          }
        : null,

    createdAt:
      order.createdAt
  };
}

export const createOrder =
  asyncHandler(async (req, res) => {
    const validation =
      createOrderSchema.safeParse(
        req.body
      );

    if (!validation.success) {
      throw createHttpError(
        400,
        "Invalid order information",
        validation.error.flatten()
      );
    }

    const payload =
      validation.data;

    validatePaymentMethod(
      payload.paymentMethod
    );

    const paymentProof =
      buildPaymentProof(
        payload.paymentMethod,
        payload.paymentProof
      );

    const session =
      await mongoose.startSession();

    let createdOrder = null;

    try {
      await session.withTransaction(
        async () => {
          const pricing =
            await calculateOrderPricing(
              {
                requestedItems:
                  payload.items,

                governorate:
                  payload
                    .shippingAddress
                    .governorate,

                discountCode:
                  payload
                    .discountCode,

                customerEmail:
                  payload.customer
                    .email,

                session,

                reserveDiscount:
                  Boolean(
                    payload
                      .discountCode
                  ),

                reserveOffers:
                  true,

                softFailDiscount:
                  false
              }
            );

          await decrementStockForItems(
            {
              normalizedItems:
                pricing
                  .normalizedItems,

              session
            }
          );

          const orderNumber =
            await generateOrderNumber(
              session
            );

          const paymentStatus =
            payload.paymentMethod ===
              "instapay" ||
            payload.paymentMethod ===
              "vodafone_cash"
              ? "pending_review"
              : "unpaid";

          const orderData = {
            orderNumber,

            customer:
              payload.customer,

            shippingAddress:
              payload
                .shippingAddress,

            items:
              pricing
                .normalizedItems,

            offers:
              pricing.offers,

            totals:
              pricing.totals,

            payment: {
              method:
                payload
                  .paymentMethod,

              status:
                paymentStatus,

              proofImageUrl:
                paymentProof
                  .imageUrl,

              proofImagePublicId:
                paymentProof
                  .imagePublicId
            },

            status:
              "pending",

            customerNote:
              payload.customerNote
          };

          if (
            pricing.discount
          ) {
            orderData.discount =
              pricing.discount;
          }

          const [order] =
            await Order.create(
              [orderData],
              {
                session
              }
            );

          createdOrder =
            order;
        }
      );
    } finally {
      await session.endSession();
    }

    let payment = {
      required: false,
      initialized: false,
      retryRequired: false,
      redirectUrl: ""
    };

    if (
      createdOrder.payment
        .method === "card"
    ) {
      try {
        payment =
          await initializeCardPayment(
            createdOrder
          );
      } catch (error) {
        console.error(
          `[paymob] Could not initialize payment for ${createdOrder.orderNumber}:`,
          error
        );

        createdOrder.payment
          .paymob
          .initializationError =
          "The secure card-payment page could not be opened";

        await createdOrder.save();

        payment = {
          required: true,
          initialized: false,
          retryRequired: true,
          redirectUrl: "",

          message:
            "Your order was created, but the secure card-payment page could not be opened. You can retry without creating another order."
        };
      }
    }

    queueOrderCreatedNotifications(
      createdOrder
    );

    res.status(201).json({
      success: true,

      message:
        "Order placed successfully",

      order:
        serializeOrder(
          createdOrder
        ),

      payment
    });
  });
