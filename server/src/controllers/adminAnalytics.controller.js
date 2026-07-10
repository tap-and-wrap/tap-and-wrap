import Order from "../models/Order.js";
import Product from "../models/Product.js";

import {
  getRuntimeStoreSettings
} from "../config/storeConfig.js";

import {
  asyncHandler
} from "../utils/asyncHandler.js";

const ALLOWED_PERIODS = new Set([
  7,
  30,
  90,
  365
]);

function getSelectedDays(value) {
  const parsedValue =
    Number.parseInt(
      value,
      10
    );

  if (
    ALLOWED_PERIODS.has(
      parsedValue
    )
  ) {
    return parsedValue;
  }

  return 30;
}

function getPeriodStart(days) {
  const date = new Date();

  date.setDate(
    date.getDate() -
      (days - 1)
  );

  date.setHours(
    0,
    0,
    0,
    0
  );

  return date;
}

function createDateSeries({
  days,
  dailyResults
}) {
  const resultMap =
    new Map(
      dailyResults.map(
        (entry) => [
          entry.date,
          entry
        ]
      )
    );

  const series = [];

  for (
    let offset = days - 1;
    offset >= 0;
    offset -= 1
  ) {
    const currentDate =
      new Date();

    currentDate.setDate(
      currentDate.getDate() -
        offset
    );

    currentDate.setHours(
      0,
      0,
      0,
      0
    );

    const dateKey =
      currentDate
        .toISOString()
        .slice(0, 10);

    const existingEntry =
      resultMap.get(
        dateKey
      );

    series.push({
      date: dateKey,

      orders:
        existingEntry?.orders ||
        0,

      revenue:
        existingEntry?.revenue ||
        0
    });
  }

  return series;
}

export const getAdminAnalytics =
  asyncHandler(async (req, res) => {
    const days =
      getSelectedDays(
        req.query.days
      );

    const fromDate =
      getPeriodStart(days);

    const now = new Date();

    const periodFilter = {
      createdAt: {
        $gte: fromDate,
        $lte: now
      }
    };

    const lowStockThreshold =
      Math.max(
        Number(
          getRuntimeStoreSettings()
            .inventory
            .lowStockThreshold || 0
        ),
        0
      );

    const [
      totalOrders,
      deliveredOrders,
      pendingOrders,
      cancelledOrders,
      paymentReviewOrders,
      deliveredRevenueResult,
      allActiveOrderValueResult,
      statusBreakdown,
      paymentMethodBreakdown,
      dailyResults,
      topProducts,
      lowStockProducts,
      activeProductCount
    ] = await Promise.all([
      Order.countDocuments(
        periodFilter
      ),

      Order.countDocuments({
        ...periodFilter,
        status: "delivered"
      }),

      Order.countDocuments({
        ...periodFilter,

        status: {
          $in: [
            "pending",
            "confirmed",
            "preparing",
            "ready",
            "out_for_delivery"
          ]
        }
      }),

      Order.countDocuments({
        ...periodFilter,
        status: "cancelled"
      }),

      Order.countDocuments({
        ...periodFilter,

        "payment.status":
          "pending_review",

        status: {
          $ne: "cancelled"
        }
      }),

      Order.aggregate([
        {
          $match: {
            ...periodFilter,
            status: "delivered"
          }
        },

        {
          $group: {
            _id: null,

            revenue: {
              $sum:
                "$totals.grandTotal"
            }
          }
        }
      ]),

      Order.aggregate([
        {
          $match: {
            ...periodFilter,

            status: {
              $ne: "cancelled"
            }
          }
        },

        {
          $group: {
            _id: null,

            value: {
              $sum:
                "$totals.grandTotal"
            }
          }
        }
      ]),

      Order.aggregate([
        {
          $match:
            periodFilter
        },

        {
          $group: {
            _id: "$status",

            count: {
              $sum: 1
            }
          }
        },

        {
          $sort: {
            count: -1
          }
        }
      ]),

      Order.aggregate([
        {
          $match: {
            ...periodFilter,

            status: {
              $ne: "cancelled"
            }
          }
        },

        {
          $group: {
            _id:
              "$payment.method",

            count: {
              $sum: 1
            },

            value: {
              $sum:
                "$totals.grandTotal"
            }
          }
        },

        {
          $sort: {
            count: -1
          }
        }
      ]),

      Order.aggregate([
        {
          $match: {
            ...periodFilter,

            status: {
              $ne: "cancelled"
            }
          }
        },

        {
          $group: {
            _id: {
              $dateToString: {
                format: "%Y-%m-%d",
                date: "$createdAt",
                timezone:
                  "Africa/Cairo"
              }
            },

            orders: {
              $sum: 1
            },

            revenue: {
              $sum: {
                $cond: [
                  {
                    $eq: [
                      "$status",
                      "delivered"
                    ]
                  },

                  "$totals.grandTotal",
                  0
                ]
              }
            }
          }
        },

        {
          $project: {
            _id: 0,
            date: "$_id",
            orders: 1,
            revenue: 1
          }
        },

        {
          $sort: {
            date: 1
          }
        }
      ]),

      Order.aggregate([
        {
          $match: {
            ...periodFilter,

            status: {
              $ne: "cancelled"
            }
          }
        },

        {
          $unwind: "$items"
        },

        {
          $group: {
            _id: {
              product:
                "$items.product",

              productName:
                "$items.productName",

              productImage:
                "$items.productImage"
            },

            quantitySold: {
              $sum:
                "$items.quantity"
            },

            orderRevenue: {
              $sum:
                "$items.lineTotal"
            },

            orderIds: {
              $addToSet: "$_id"
            }
          }
        },

        {
          $project: {
            _id: 0,

            productId:
              "$_id.product",

            productName:
              "$_id.productName",

            productImage:
              "$_id.productImage",

            quantitySold: 1,
            orderRevenue: 1,

            orderCount: {
              $size: "$orderIds"
            }
          }
        },

        {
          $sort: {
            quantitySold: -1,
            orderRevenue: -1
          }
        },

        {
          $limit: 8
        }
      ]),

      Product.find({
        isActive: true,

        stock: {
          $lte:
            lowStockThreshold
        }
      })
        .sort({
          stock: 1,
          name: 1
        })
        .limit(12)
        .select(
          "name slug sku stock images"
        )
        .lean(),

      Product.countDocuments({
        isActive: true
      })
    ]);

    const deliveredRevenue =
      Number(
        deliveredRevenueResult[0]
          ?.revenue || 0
      );

    const activeOrderValue =
      Number(
        allActiveOrderValueResult[0]
          ?.value || 0
      );

    const averageOrderValue =
      deliveredOrders > 0
        ? deliveredRevenue /
          deliveredOrders
        : 0;

    const daily =
      createDateSeries({
        days,
        dailyResults
      });

    const normalizedLowStockProducts =
      lowStockProducts.map(
        (product) => {
          const sortedImages = [
            ...(product.images ||
              [])
          ].sort(
            (
              first,
              second
            ) =>
              Number(
                first.sortOrder ||
                  0
              ) -
              Number(
                second.sortOrder ||
                  0
              )
          );

          const image =
            sortedImages.find(
              (item) =>
                item.isMain
            ) ||
            sortedImages[0] ||
            null;

          return {
            _id: product._id,
            name: product.name,
            slug: product.slug,
            sku: product.sku,
            stock: product.stock,

            imageUrl:
              image?.url || ""
          };
        }
      );

    res.status(200).json({
      success: true,

      analytics: {
        range: {
          days,
          from: fromDate,
          to: now
        },

        metrics: {
          totalOrders,
          deliveredOrders,
          pendingOrders,
          cancelledOrders,
          paymentReviewOrders,
          deliveredRevenue,
          activeOrderValue,
          averageOrderValue,
          activeProductCount,

          lowStockCount:
            normalizedLowStockProducts
              .length,

          lowStockThreshold
        },

        daily,

        statusBreakdown:
          statusBreakdown.map(
            (entry) => ({
              status: entry._id,
              count: entry.count
            })
          ),

        paymentMethodBreakdown:
          paymentMethodBreakdown.map(
            (entry) => ({
              method: entry._id,
              count: entry.count,
              value: entry.value
            })
          ),

        topProducts,

        lowStockProducts:
          normalizedLowStockProducts
      }
    });
  });
