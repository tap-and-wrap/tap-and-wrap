import mongoose from "mongoose";

import Order from "../models/Order.js";
import Product from "../models/Product.js";

import { asyncHandler } from "../utils/asyncHandler.js";
import { createHttpError } from "../utils/httpError.js";
import { escapeRegex } from "../utils/slug.js";
import {
  queueOrderStatusNotification,
  queuePaymentStatusNotification
} from "../services/notification.service.js";

import {
  updateOrderStatusSchema,
  updatePaymentStatusSchema
} from "../validators/adminOrder.validator.js";

const ORDER_STATUS_TRANSITIONS = {
  pending: ["confirmed", "cancelled"],
  confirmed: ["preparing", "cancelled"],
  preparing: ["ready", "cancelled"],
  ready: ["out_for_delivery", "cancelled"],
  out_for_delivery: ["delivered", "cancelled"],
  delivered: [],
  cancelled: []
};

const PAYMENT_STATUS_TRANSITIONS = {
  unpaid: ["pending_review", "paid", "failed"],
  pending_review: ["paid", "failed"],
  paid: ["refunded"],
  failed: ["pending_review", "paid"],
  refunded: []
};

function getPaginationValues(query) {
  const page = Math.max(
    Number.parseInt(query.page, 10) || 1,
    1
  );

  const limit = Math.min(
    Math.max(
      Number.parseInt(query.limit, 10) || 20,
      1
    ),
    100
  );

  return {
    page,
    limit,
    skip: (page - 1) * limit
  };
}

function createOrderLookup(id) {
  const trimmedId = String(id || "").trim();

  if (!trimmedId) {
    throw createHttpError(400, "Order identifier is required");
  }

  if (mongoose.Types.ObjectId.isValid(trimmedId)) {
    return {
      $or: [
        {
          _id: trimmedId
        },
        {
          orderNumber: trimmedId
        }
      ]
    };
  }

  return {
    orderNumber: trimmedId
  };
}

function validateOrderTransition(currentStatus, nextStatus) {
  if (currentStatus === nextStatus) {
    return;
  }

  const allowedStatuses =
    ORDER_STATUS_TRANSITIONS[currentStatus] || [];

  if (!allowedStatuses.includes(nextStatus)) {
    throw createHttpError(
      400,
      `Order cannot move from ${currentStatus} to ${nextStatus}`
    );
  }
}

function validatePaymentTransition(currentStatus, nextStatus) {
  if (currentStatus === nextStatus) {
    return;
  }

  const allowedStatuses =
    PAYMENT_STATUS_TRANSITIONS[currentStatus] || [];

  if (!allowedStatuses.includes(nextStatus)) {
    throw createHttpError(
      400,
      `Payment cannot move from ${currentStatus} to ${nextStatus}`
    );
  }
}

export const getAdminDashboard = asyncHandler(
  async (req, res) => {
    const [
      totalOrders,
      pendingOrders,
      activeProducts,
      paymentReviewOrders,
      deliveredRevenueResult,
      recentOrders
    ] = await Promise.all([
      Order.countDocuments(),

      Order.countDocuments({
        status: "pending"
      }),

      Product.countDocuments({
        isActive: true
      }),

      Order.countDocuments({
        "payment.status": "pending_review"
      }),

      Order.aggregate([
        {
          $match: {
            status: "delivered"
          }
        },
        {
          $group: {
            _id: null,
            total: {
              $sum: "$totals.grandTotal"
            }
          }
        }
      ]),

      Order.find()
        .sort({
          createdAt: -1
        })
        .limit(6)
        .select(
          "orderNumber customer items totals payment status createdAt"
        )
        .lean()
    ]);

    const deliveredRevenue =
      deliveredRevenueResult[0]?.total || 0;

    res.status(200).json({
      success: true,

      dashboard: {
        metrics: {
          totalOrders,
          pendingOrders,
          activeProducts,
          deliveredRevenue,
          paymentReviewOrders
        },

        recentOrders
      }
    });
  }
);

export const listAdminOrders = asyncHandler(
  async (req, res) => {
    const {
      page,
      limit,
      skip
    } = getPaginationValues(req.query);

    const filter = {};

    const status = String(req.query.status || "").trim();

    const paymentStatus = String(
      req.query.paymentStatus || ""
    ).trim();

    const paymentMethod = String(
      req.query.paymentMethod || ""
    ).trim();

    const search = String(req.query.search || "").trim();

    if (status && status !== "all") {
      filter.status = status;
    }

    if (paymentStatus && paymentStatus !== "all") {
      filter["payment.status"] = paymentStatus;
    }

    if (paymentMethod && paymentMethod !== "all") {
      filter["payment.method"] = paymentMethod;
    }

    if (search) {
      const searchExpression = new RegExp(
        escapeRegex(search),
        "i"
      );

      filter.$or = [
        {
          orderNumber: searchExpression
        },
        {
          "customer.fullName": searchExpression
        },
        {
          "customer.email": searchExpression
        },
        {
          "customer.phone": searchExpression
        },
        {
          "shippingAddress.recipientName": searchExpression
        },
        {
          "shippingAddress.recipientPhone": searchExpression
        }
      ];
    }

    const [orders, total] = await Promise.all([
      Order.find(filter)
        .sort({
          createdAt: -1
        })
        .skip(skip)
        .limit(limit)
        .select(
          "orderNumber customer shippingAddress items totals payment status createdAt updatedAt"
        )
        .lean(),

      Order.countDocuments(filter)
    ]);

    const totalPages = Math.max(
      Math.ceil(total / limit),
      1
    );

    res.status(200).json({
      success: true,
      orders,

      pagination: {
        page,
        limit,
        total,
        totalPages,
        hasPreviousPage: page > 1,
        hasNextPage: page < totalPages
      }
    });
  }
);

export const getAdminOrderById = asyncHandler(
  async (req, res) => {
    const order = await Order.findOne(
      createOrderLookup(req.params.id)
    )
      .populate({
        path: "statusHistory.changedBy",
        select: "name email"
      })
      .populate({
        path: "paymentStatusHistory.changedBy",
        select: "name email"
      })
      .lean();

    if (!order) {
      throw createHttpError(404, "Order was not found");
    }

    res.status(200).json({
      success: true,
      order
    });
  }
);

export const updateAdminOrderStatus = asyncHandler(
  async (req, res) => {
    const validation = updateOrderStatusSchema.safeParse(
      req.body
    );

    if (!validation.success) {
      throw createHttpError(
        400,
        "Invalid order status information",
        validation.error.flatten()
      );
    }

    const {
      status,
      internalNote,
      cancellationReason
    } = validation.data;

    const session = await mongoose.startSession();

    let updatedOrder = null;
    let previousOrderStatus = "";

    try {
      await session.withTransaction(async () => {
        const order = await Order.findOne(
          createOrderLookup(req.params.id)
        ).session(session);

        if (!order) {
          throw createHttpError(404, "Order was not found");
        }

        validateOrderTransition(order.status, status);

        if (
          status === "cancelled" &&
          !cancellationReason
        ) {
          throw createHttpError(
            400,
            "Cancellation reason is required"
          );
        }

        const previousStatus = order.status;
        previousOrderStatus = previousStatus;

        if (
          status === "cancelled" &&
          !order.inventoryRestored
        ) {
          const stockUpdates = order.items.map((item) => ({
            updateOne: {
              filter: {
                _id: item.product
              },

              update: {
                $inc: {
                  stock: item.quantity
                }
              }
            }
          }));

          if (stockUpdates.length) {
            await Product.bulkWrite(stockUpdates, {
              session
            });
          }

          order.inventoryRestored = true;
          order.inventoryRestoredAt = new Date();
        }

        order.status = status;
        order.internalNote = internalNote;

        if (status === "cancelled") {
          order.cancellationReason = cancellationReason;
        }

        if (previousStatus !== status) {
          order.statusHistory.push({
            from: previousStatus,
            to: status,
            note:
              status === "cancelled"
                ? cancellationReason
                : internalNote,
            changedBy: req.admin._id,
            changedAt: new Date()
          });
        }

        await order.save({
          session
        });

        updatedOrder = order;
      });
    } finally {
      await session.endSession();
    }

    queueOrderStatusNotification({
      order: updatedOrder,
      previousStatus: previousOrderStatus
    });

    res.status(200).json({
      success: true,
      message: "Order status updated successfully",
      order: updatedOrder
    });
  }
);

export const updateAdminPaymentStatus = asyncHandler(
  async (req, res) => {
    const validation =
      updatePaymentStatusSchema.safeParse(req.body);

    if (!validation.success) {
      throw createHttpError(
        400,
        "Invalid payment status information",
        validation.error.flatten()
      );
    }

    const {
      status,
      transactionId,
      note
    } = validation.data;

    const order = await Order.findOne(
      createOrderLookup(req.params.id)
    );

    if (!order) {
      throw createHttpError(404, "Order was not found");
    }

    const previousStatus = order.payment.status;

    validatePaymentTransition(previousStatus, status);

    order.payment.status = status;

    if (transactionId) {
      order.payment.transactionId = transactionId;
    }

    if (previousStatus !== status) {
      order.paymentStatusHistory.push({
        from: previousStatus,
        to: status,
        transactionId,
        note,
        changedBy: req.admin._id,
        changedAt: new Date()
      });
    }

    await order.save();

    queuePaymentStatusNotification({
      order,
      previousStatus
    });

    res.status(200).json({
      success: true,
      message: "Payment status updated successfully",
      order
    });
  }
);