import mongoose from "mongoose";

import BundleOffer from "./BundleOffer.js";
import DiscountCode from "./DiscountCode.js";

const engravingSchema =
  new mongoose.Schema(
    {
      enabled: {
        type: Boolean,
        default: false
      },

      type: {
        type: String,
        enum: [
          "none",
          "text",
          "image"
        ],
        default: "none"
      },

      text: {
        type: String,
        default: "",
        trim: true
      },

      placement: {
        type: String,
        default: "",
        trim: true
      },

      imageUrl: {
        type: String,
        default: ""
      },

      imagePublicId: {
        type: String,
        default: ""
      },

      imageFileName: {
        type: String,
        default: "",
        trim: true
      },

      price: {
        type: Number,
        default: 0,
        min: 0
      }
    },
    {
      _id: false
    }
  );

const wrappingSchema =
  new mongoose.Schema(
    {
      enabled: {
        type: Boolean,
        default: false
      },

      boxColor: {
        type: String,
        default: "",
        trim: true
      },

      ribbonColor: {
        type: String,
        default: "",
        trim: true
      },

      giftCard: {
        type: Boolean,
        default: false
      },

      giftCardMessage: {
        type: String,
        default: "",
        trim: true
      },

      textOnBox: {
        type: Boolean,
        default: false
      },

      boxText: {
        type: String,
        default: "",
        trim: true
      },

      fillers: {
        type: Boolean,
        default: false
      },

      basePrice: {
        type: Number,
        default: 0,
        min: 0
      },

      giftCardPrice: {
        type: Number,
        default: 0,
        min: 0
      },

      textOnBoxPrice: {
        type: Number,
        default: 0,
        min: 0
      },

      fillersPrice: {
        type: Number,
        default: 0,
        min: 0
      },

      total: {
        type: Number,
        default: 0,
        min: 0
      }
    },
    {
      _id: false
    }
  );

const orderItemSchema =
  new mongoose.Schema(
    {
      product: {
        type:
          mongoose.Schema.Types
            .ObjectId,

        ref: "Product",
        required: true
      },

      category: {
        type:
          mongoose.Schema.Types
            .ObjectId,

        ref: "Category",
        default: null
      },

      subcategory: {
        type:
          mongoose.Schema.Types
            .ObjectId,

        ref: "Category",
        default: null
      },

      productName: {
        type: String,
        required: true,
        trim: true
      },

      productSlug: {
        type: String,
        required: true,
        trim: true
      },

      productImage: {
        type: String,
        default: ""
      },

      sku: {
        type: String,
        default: "",
        trim: true
      },

      quantity: {
        type: Number,
        required: true,
        min: 1
      },

      productUnitPrice: {
        type: Number,
        required: true,
        min: 0
      },

      engraving: {
        type:
          engravingSchema,

        default: () => ({})
      },

      wrapping: {
        type:
          wrappingSchema,

        default: () => ({})
      },

      offerDiscount: {
        type: Number,
        default: 0,
        min: 0
      },

      unitTotal: {
        type: Number,
        required: true,
        min: 0
      },

      lineTotal: {
        type: Number,
        required: true,
        min: 0
      }
    },
    {
      _id: true
    }
  );

const appliedOfferSchema =
  new mongoose.Schema(
    {
      offer: {
        type:
          mongoose.Schema.Types
            .ObjectId,

        ref: "BundleOffer",
        required: true
      },

      name: {
        type: String,
        required: true,
        trim: true
      },

      type: {
        type: String,

        enum: [
          "any_n",
          "fixed_products"
        ],

        required: true
      },

      discountMode: {
        type: String,

        enum: [
          "fixed_bundle_price",
          "percentage_off",
          "fixed_amount_off",
          "none"
        ],

        required: true
      },

      discountValue: {
        type: Number,
        default: 0,
        min: 0
      },

      requiredQuantity: {
        type: Number,
        default: 0,
        min: 0
      },

      applications: {
        type: Number,
        required: true,
        min: 1
      },

      merchandiseSubtotal: {
        type: Number,
        default: 0,
        min: 0
      },

      merchandiseDiscount: {
        type: Number,
        default: 0,
        min: 0
      },

      shippingDiscount: {
        type: Number,
        default: 0,
        min: 0
      },

      freeShipping: {
        type: Boolean,
        default: false
      },

      priority: {
        type: Number,
        default: 0
      }
    },
    {
      _id: true
    }
  );

const discountSnapshotSchema =
  new mongoose.Schema(
    {
      discountCode: {
        type:
          mongoose.Schema.Types
            .ObjectId,

        ref: "DiscountCode",
        default: null
      },

      code: {
        type: String,
        default: "",
        trim: true
      },

      name: {
        type: String,
        default: "",
        trim: true
      },

      type: {
        type: String,

        enum: [
          "none",
          "percentage",
          "fixed",
          "free_shipping"
        ],

        default: "none"
      },

      value: {
        type: Number,
        default: 0
      },

      scope: {
        type: String,

        enum: [
          "all_products",
          "selected_products",
          "selected_categories"
        ],

        default: "all_products"
      },

      minimumSubtotal: {
        type: Number,
        default: 0
      },

      merchandiseDiscount: {
        type: Number,
        default: 0,
        min: 0
      },

      shippingDiscount: {
        type: Number,
        default: 0,
        min: 0
      },

      amount: {
        type: Number,
        default: 0,
        min: 0
      }
    },
    {
      _id: false
    }
  );

const statusHistorySchema =
  new mongoose.Schema(
    {
      from: {
        type: String,
        default: ""
      },

      to: {
        type: String,
        required: true
      },

      note: {
        type: String,
        default: "",
        trim: true
      },

      changedBy: {
        type:
          mongoose.Schema.Types
            .ObjectId,

        ref: "Admin",
        default: null
      },

      changedAt: {
        type: Date,
        default: Date.now
      }
    },
    {
      _id: true
    }
  );

const paymentStatusHistorySchema =
  new mongoose.Schema(
    {
      from: {
        type: String,
        default: ""
      },

      to: {
        type: String,
        required: true
      },

      transactionId: {
        type: String,
        default: "",
        trim: true
      },

      note: {
        type: String,
        default: "",
        trim: true
      },

      changedBy: {
        type:
          mongoose.Schema.Types
            .ObjectId,

        ref: "Admin",
        default: null
      },

      changedAt: {
        type: Date,
        default: Date.now
      }
    },
    {
      _id: true
    }
  );

const paymobAttemptSchema =
  new mongoose.Schema(
    {
      transactionId: {
        type: String,
        default: "",
        trim: true
      },

      status: {
        type: String,
        default: "",
        trim: true
      },

      success: {
        type: Boolean,
        default: false
      },

      pending: {
        type: Boolean,
        default: false
      },

      amountCents: {
        type: Number,
        default: 0,
        min: 0
      },

      currency: {
        type: String,
        default: "",
        trim: true
      },

      sourceType: {
        type: String,
        default: "",
        trim: true
      },

      sourceSubType: {
        type: String,
        default: "",
        trim: true
      },

      maskedPan: {
        type: String,
        default: "",
        trim: true
      },

      callbackType: {
        type: String,
        default: "",
        trim: true
      },

      receivedAt: {
        type: Date,
        default: Date.now
      }
    },
    {
      _id: true
    }
  );

const paymobSchema =
  new mongoose.Schema(
    {
      orderId: {
        type: String,
        default: "",
        trim: true
      },

      merchantOrderId: {
        type: String,
        default: "",
        trim: true
      },

      integrationId: {
        type: String,
        default: "",
        trim: true
      },

      iframeId: {
        type: String,
        default: "",
        trim: true
      },

      lastSessionCreatedAt: {
        type: Date,
        default: null
      },

      sessionExpiresAt: {
        type: Date,
        default: null
      },

      initializationError: {
        type: String,
        default: "",
        trim: true
      },

      latestTransactionId: {
        type: String,
        default: "",
        trim: true
      },

      latestTransactionStatus: {
        type: String,
        default: "",
        trim: true
      },

      lastCallbackAt: {
        type: Date,
        default: null
      },

      callbackCount: {
        type: Number,
        default: 0,
        min: 0
      },

      processedTransactionIds: {
        type: [String],
        default: []
      },

      attempts: {
        type: [
          paymobAttemptSchema
        ],
        default: []
      }
    },
    {
      _id: false
    }
  );

const orderSchema =
  new mongoose.Schema(
    {
      orderNumber: {
        type: String,
        required: true,
        unique: true,
        index: true,
        trim: true
      },

      customer: {
        fullName: {
          type: String,
          required: true,
          trim: true
        },

        email: {
          type: String,
          required: true,
          trim: true,
          lowercase: true,
          index: true
        },

        phone: {
          type: String,
          required: true,
          trim: true,
          index: true
        },

        alternatePhone: {
          type: String,
          default: "",
          trim: true
        }
      },

      shippingAddress: {
        recipientName: {
          type: String,
          required: true,
          trim: true
        },

        recipientPhone: {
          type: String,
          required: true,
          trim: true
        },

        governorate: {
          type: String,
          required: true,
          trim: true
        },

        city: {
          type: String,
          required: true,
          trim: true
        },

        area: {
          type: String,
          default: "",
          trim: true
        },

        addressLine: {
          type: String,
          required: true,
          trim: true
        },

        building: {
          type: String,
          default: "",
          trim: true
        },

        floor: {
          type: String,
          default: "",
          trim: true
        },

        apartment: {
          type: String,
          default: "",
          trim: true
        },

        landmark: {
          type: String,
          default: "",
          trim: true
        }
      },

      items: {
        type: [
          orderItemSchema
        ],
        required: true,

        validate: {
          validator(value) {
            return (
              Array.isArray(
                value
              ) &&
              value.length > 0
            );
          },

          message:
            "Order must contain at least one item"
        }
      },

      offers: {
        type: [
          appliedOfferSchema
        ],
        default: []
      },

      offerUsageRestored: {
        type: Boolean,
        default: false
      },

      offerUsageRestoredAt: {
        type: Date,
        default: null
      },

      totals: {
        subtotal: {
          type: Number,
          required: true,
          min: 0
        },

        shippingFee: {
          type: Number,
          required: true,
          min: 0
        },

        offerDiscount: {
          type: Number,
          default: 0,
          min: 0
        },

        codeDiscount: {
          type: Number,
          default: 0,
          min: 0
        },

        discount: {
          type: Number,
          default: 0,
          min: 0
        },

        grandTotal: {
          type: Number,
          required: true,
          min: 0
        }
      },

      discount: {
        type:
          discountSnapshotSchema,

        default: () => ({})
      },

      discountUsageRestored: {
        type: Boolean,
        default: false
      },

      discountUsageRestoredAt: {
        type: Date,
        default: null
      },

      payment: {
        method: {
          type: String,
          required: true,

          enum: [
            "cod",
            "instapay",
            "vodafone_cash",
            "card"
          ]
        },

        status: {
          type: String,

          enum: [
            "unpaid",
            "pending_review",
            "paid",
            "failed",
            "refunded"
          ],

          default: "unpaid",
          index: true
        },

        transactionId: {
          type: String,
          default: "",
          trim: true
        },

        proofImageUrl: {
          type: String,
          default: ""
        },

        proofImagePublicId: {
          type: String,
          default: ""
        },

        paymob: {
          type:
            paymobSchema,

          default: () => ({})
        }
      },

      status: {
        type: String,

        enum: [
          "pending",
          "confirmed",
          "preparing",
          "ready",
          "out_for_delivery",
          "delivered",
          "cancelled"
        ],

        default: "pending",
        index: true
      },

      statusHistory: {
        type: [
          statusHistorySchema
        ],
        default: []
      },

      paymentStatusHistory: {
        type: [
          paymentStatusHistorySchema
        ],
        default: []
      },

      inventoryRestored: {
        type: Boolean,
        default: false
      },

      inventoryRestoredAt: {
        type: Date,
        default: null
      },

      customerNote: {
        type: String,
        default: "",
        trim: true
      },

      internalNote: {
        type: String,
        default: "",
        trim: true
      },

      cancellationReason: {
        type: String,
        default: "",
        trim: true
      }
    },
    {
      timestamps: true
    }
  );

orderSchema.pre(
  "save",
  async function restorePromotionUsageOnCancellation() {
    if (
      !this.isModified(
        "status"
      ) ||
      this.status !==
        "cancelled"
    ) {
      return;
    }

    const session =
      this.$session();

    const options =
      session
        ? {
            session
          }
        : {};

    if (
      !this
        .discountUsageRestored &&
      this.discount
        ?.discountCode
    ) {
      await DiscountCode.updateOne(
        {
          _id:
            this.discount
              .discountCode,

          usedCount: {
            $gt: 0
          }
        },

        {
          $inc: {
            usedCount: -1
          }
        },

        options
      );

      this.discountUsageRestored =
        true;

      this.discountUsageRestoredAt =
        new Date();
    }

    if (
      !this.offerUsageRestored &&
      this.offers?.length
    ) {
      const operations =
        this.offers.map(
          (appliedOffer) => ({
            updateOne: {
              filter: {
                _id:
                  appliedOffer.offer,

                usedOrderCount: {
                  $gt: 0
                },

                applicationCount: {
                  $gte:
                    Number(
                      appliedOffer
                        .applications ||
                        0
                    )
                }
              },

              update: {
                $inc: {
                  usedOrderCount:
                    -1,

                  applicationCount:
                    -Number(
                      appliedOffer
                        .applications ||
                        0
                    )
                }
              }
            }
          })
        );

      await BundleOffer.bulkWrite(
        operations,
        options
      );

      this.offerUsageRestored =
        true;

      this.offerUsageRestoredAt =
        new Date();
    }
  }
);

orderSchema.index({
  createdAt: -1,
  status: 1
});

orderSchema.index({
  "payment.status": 1,
  createdAt: -1
});

orderSchema.index({
  "payment.paymob.orderId": 1
});

const Order =
  mongoose.models.Order ||
  mongoose.model(
    "Order",
    orderSchema
  );

export default Order;
