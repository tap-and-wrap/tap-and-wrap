import Order from "../models/Order.js";

import {
  getPaymobConfig,
  isPaymobConfigured
} from "../config/paymob.js";

import {
  asyncHandler
} from "../utils/asyncHandler.js";

import {
  createHttpError
} from "../utils/httpError.js";

import {
  createPaymobCheckoutSession,
  createPaymentResultSignature,
  getExpectedAmountCents,
  normalizePaymobTransaction,
  verifyPaymentResultSignature,
  verifyPaymobHmac
} from "../services/paymob.service.js";

import {
  queuePaymentStatusNotification
} from "../services/notification.service.js";

import {
  paymentResultSchema,
  retryCardPaymentSchema
} from "../validators/paymob.validator.js";

function getCallbackPayload(req) {
  return req.body?.obj ||
    req.body ||
    {};
}

function getReceivedHmac(req) {
  return String(
    req.query?.hmac ||
      req.body?.hmac ||
      ""
  ).trim();
}

function getPaymentEventStatus(
  transaction
) {
  if (
    transaction.isRefunded
  ) {
    return "refunded";
  }

  if (
    transaction.pending
  ) {
    return "pending";
  }

  if (
    transaction.success &&
    !transaction.errorOccurred &&
    !transaction.isVoided
  ) {
    return "paid";
  }

  return "failed";
}

function getNextPaymentStatus({
  currentStatus,
  eventStatus
}) {
  if (
    currentStatus ===
    "refunded"
  ) {
    return "refunded";
  }

  if (
    eventStatus ===
    "refunded"
  ) {
    return "refunded";
  }

  if (
    currentStatus ===
      "paid" &&
    eventStatus !==
      "refunded"
  ) {
    return "paid";
  }

  if (
    eventStatus ===
    "pending"
  ) {
    return currentStatus;
  }

  return eventStatus;
}

function createAttemptSnapshot({
  transaction,
  callbackType,
  eventStatus
}) {
  return {
    transactionId:
      transaction.transactionId,

    status:
      eventStatus,

    success:
      transaction.success,

    pending:
      transaction.pending,

    amountCents:
      transaction.amountCents,

    currency:
      transaction.currency,

    sourceType:
      transaction.sourceType,

    sourceSubType:
      transaction.sourceSubType,

    maskedPan:
      transaction.maskedPan,

    callbackType,

    receivedAt:
      new Date()
  };
}

async function findOrderForTransaction(
  transaction
) {
  const filters = [];

  if (
    transaction.merchantOrderId
  ) {
    filters.push({
      orderNumber:
        transaction.merchantOrderId
    });
  }

  if (
    transaction.paymobOrderId
  ) {
    filters.push({
      "payment.paymob.orderId":
        transaction.paymobOrderId
    });
  }

  if (!filters.length) {
    throw createHttpError(
      400,
      "Paymob callback does not contain an order identifier"
    );
  }

  return Order.findOne({
    $or: filters
  });
}

async function processPaymobTransaction({
  payload,
  callbackType
}) {
  const transaction =
    normalizePaymobTransaction(
      payload
    );

  if (
    !transaction.transactionId
  ) {
    throw createHttpError(
      400,
      "Paymob callback does not contain a transaction ID"
    );
  }

  const existingOrder =
    await findOrderForTransaction(
      transaction
    );

  if (!existingOrder) {
    throw createHttpError(
      404,
      "The Paymob order could not be matched"
    );
  }

  if (
    existingOrder.payment
      ?.method !== "card"
  ) {
    throw createHttpError(
      409,
      "The matched order is not a card-payment order"
    );
  }

  const config =
    getPaymobConfig();

  if (
    transaction.integrationId !==
    String(
      config.integrationId
    )
  ) {
    throw createHttpError(
      400,
      "Paymob integration ID does not match"
    );
  }

  if (
    transaction.currency !==
    config.currency
  ) {
    throw createHttpError(
      400,
      "Paymob currency does not match the order"
    );
  }

  if (
    transaction.amountCents !==
    getExpectedAmountCents(
      existingOrder
    )
  ) {
    throw createHttpError(
      400,
      "Paymob amount does not match the order total"
    );
  }

  const alreadyProcessed =
    (
      existingOrder.payment
        ?.paymob
        ?.processedTransactionIds ||
      []
    ).includes(
      transaction.transactionId
    );

  if (alreadyProcessed) {
    return {
      order:
        existingOrder,
      transaction,
      duplicate: true
    };
  }

  const eventStatus =
    getPaymentEventStatus(
      transaction
    );

  const previousStatus =
    existingOrder.payment
      .status;

  const nextStatus =
    getNextPaymentStatus({
      currentStatus:
        previousStatus,

      eventStatus
    });

  const setValues = {
    "payment.paymob.latestTransactionId":
      transaction.transactionId,

    "payment.paymob.latestTransactionStatus":
      eventStatus,

    "payment.paymob.lastCallbackAt":
      new Date(),

    "payment.paymob.initializationError":
      ""
  };

  if (
    nextStatus !==
    previousStatus
  ) {
    setValues[
      "payment.status"
    ] = nextStatus;
  }

  if (
    eventStatus ===
      "paid" ||
    eventStatus ===
      "refunded"
  ) {
    setValues[
      "payment.transactionId"
    ] =
      transaction.transactionId;
  }

  const pushValues = {
    "payment.paymob.processedTransactionIds":
      {
        $each: [
          transaction.transactionId
        ],

        $slice: -50
      },

    "payment.paymob.attempts":
      {
        $each: [
          createAttemptSnapshot({
            transaction,
            callbackType,
            eventStatus
          })
        ],

        $slice: -20
      }
  };

  if (
    nextStatus !==
    previousStatus
  ) {
    pushValues.paymentStatusHistory =
      {
        from:
          previousStatus,

        to:
          nextStatus,

        transactionId:
          transaction.transactionId,

        note:
          `Paymob ${callbackType}`,

        changedBy:
          null,

        changedAt:
          new Date()
      };
  }

  const updatedOrder =
    await Order.findOneAndUpdate(
      {
        _id:
          existingOrder._id,

        "payment.paymob.processedTransactionIds":
          {
            $ne:
              transaction.transactionId
          }
      },

      {
        $set:
          setValues,

        $inc: {
          "payment.paymob.callbackCount":
            1
        },

        $push:
          pushValues
      },

      {
        new: true,
        runValidators: true
      }
    );

  if (!updatedOrder) {
    const duplicateOrder =
      await Order.findById(
        existingOrder._id
      );

    return {
      order:
        duplicateOrder,
      transaction,
      duplicate: true
    };
  }

  if (
    nextStatus !==
    previousStatus
  ) {
    queuePaymentStatusNotification({
      order:
        updatedOrder,

      previousStatus
    });
  }

  return {
    order:
      updatedOrder,

    transaction,
    duplicate: false
  };
}

export async function initializeCardPayment(
  order
) {
  const session =
    await createPaymobCheckoutSession(
      order
    );

  order.payment.paymob =
    order.payment.paymob || {};

  order.payment.paymob.orderId =
    session.paymobOrderId;

  order.payment.paymob.merchantOrderId =
    order.orderNumber;

  order.payment.paymob.integrationId =
    getPaymobConfig()
      .integrationId;

  order.payment.paymob.iframeId =
    getPaymobConfig()
      .iframeId;

  order.payment.paymob.lastSessionCreatedAt =
    session.createdAt;

  order.payment.paymob.sessionExpiresAt =
    session.expiresAt;

  order.payment.paymob.initializationError =
    "";

  await order.save();

  return {
    required: true,
    initialized: true,
    retryRequired: false,
    redirectUrl:
      session.redirectUrl,
    expiresAt:
      session.expiresAt
  };
}

export const retryPaymobCardPayment =
  asyncHandler(async (req, res) => {
    const validation =
      retryCardPaymentSchema.safeParse(
        req.body
      );

    if (!validation.success) {
      throw createHttpError(
        400,
        "Invalid card-payment retry information",
        validation.error.flatten()
      );
    }

    if (!isPaymobConfigured()) {
      throw createHttpError(
        503,
        "Card payment is not configured yet"
      );
    }

    const {
      orderNumber,
      email
    } = validation.data;

    const order =
      await Order.findOne({
        orderNumber,

        "customer.email":
          email
      });

    if (!order) {
      throw createHttpError(
        404,
        "The order could not be found"
      );
    }

    if (
      order.payment.method !==
      "card"
    ) {
      throw createHttpError(
        400,
        "This order does not use card payment"
      );
    }

    if (
      ["paid", "refunded"].includes(
        order.payment.status
      )
    ) {
      throw createHttpError(
        409,
        "This order no longer needs another card-payment attempt"
      );
    }

    if (
      ["cancelled", "delivered"].includes(
        order.status
      )
    ) {
      throw createHttpError(
        409,
        "This order can no longer be paid online"
      );
    }

    const payment =
      await initializeCardPayment(
        order
      );

    res.status(200).json({
      success: true,
      payment
    });
  });

export const handlePaymobWebhook =
  asyncHandler(async (req, res) => {
    const payload =
      getCallbackPayload(req);

    const validHmac =
      verifyPaymobHmac({
        payload,

        receivedHmac:
          getReceivedHmac(
            req
          )
      });

    if (!validHmac) {
      throw createHttpError(
        401,
        "Invalid Paymob callback signature"
      );
    }

    const result =
      await processPaymobTransaction({
        payload,
        callbackType:
          "processed callback"
      });

    res.status(200).json({
      success: true,
      duplicate:
        result.duplicate
    });
  });

export const handlePaymobResponse =
  asyncHandler(async (req, res) => {
    const payload =
      req.query || {};

    const validHmac =
      verifyPaymobHmac({
        payload,

        receivedHmac:
          getReceivedHmac(
            req
          )
      });

    if (!validHmac) {
      throw createHttpError(
        401,
        "Invalid Paymob response signature"
      );
    }

    const result =
      await processPaymobTransaction({
        payload,
        callbackType:
          "response callback"
      });

    const order =
      result.order;

    const transactionId =
      result.transaction
        .transactionId;

    const status =
      order.payment.status;

    const signature =
      createPaymentResultSignature({
        orderNumber:
          order.orderNumber,

        transactionId,
        status
      });

    const clientUrl =
      getPaymobConfig()
        .clientUrl;

    const redirectUrl =
      new URL(
        "/payment-result",
        `${clientUrl}/`
      );

    redirectUrl.searchParams.set(
      "orderNumber",
      order.orderNumber
    );

    redirectUrl.searchParams.set(
      "transactionId",
      transactionId
    );

    redirectUrl.searchParams.set(
      "status",
      status
    );

    redirectUrl.searchParams.set(
      "signature",
      signature
    );

    res.redirect(
      302,
      redirectUrl.toString()
    );
  });

export const getPaymobPaymentResult =
  asyncHandler(async (req, res) => {
    const validation =
      paymentResultSchema.safeParse(
        req.query
      );

    if (!validation.success) {
      throw createHttpError(
        400,
        "Invalid payment result information"
      );
    }

    const {
      orderNumber,
      transactionId,
      status,
      signature
    } = validation.data;

    const validSignature =
      verifyPaymentResultSignature({
        orderNumber,
        transactionId,
        status,
        signature
      });

    if (!validSignature) {
      throw createHttpError(
        401,
        "Invalid payment result signature"
      );
    }

    const order =
      await Order.findOne({
        orderNumber,

        "payment.paymob.processedTransactionIds":
          transactionId
      })
        .select(
          "orderNumber status totals payment.status payment.method createdAt updatedAt"
        )
        .lean();

    if (!order) {
      throw createHttpError(
        404,
        "Payment result could not be found"
      );
    }

    res.status(200).json({
      success: true,

      result: {
        orderNumber:
          order.orderNumber,

        orderStatus:
          order.status,

        paymentMethod:
          order.payment.method,

        paymentStatus:
          order.payment.status,

        totals:
          order.totals,

        createdAt:
          order.createdAt,

        updatedAt:
          order.updatedAt
      }
    });
  });
