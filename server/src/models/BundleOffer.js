import mongoose from "mongoose";

const bundleItemSchema = new mongoose.Schema(
  {
    product: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Product",
      required: true
    },

    quantity: {
      type: Number,
      required: true,
      min: 1
    }
  },
  {
    _id: true
  }
);

const bundleOfferSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: [true, "Offer name is required"],
      trim: true,
      maxlength: [
        150,
        "Offer name cannot exceed 150 characters"
      ]
    },

    description: {
      type: String,
      default: "",
      trim: true,
      maxlength: [
        1500,
        "Description cannot exceed 1500 characters"
      ]
    },

    type: {
      type: String,
      required: true,
      enum: ["any_n", "fixed_products"],
      index: true
    },

    scope: {
      type: String,
      enum: [
        "all_products",
        "selected_products",
        "selected_categories"
      ],
      default: "selected_products"
    },

    products: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: "Product"
      }
    ],

    categories: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: "Category"
      }
    ],

    bundleItems: {
      type: [bundleItemSchema],
      default: []
    },

    requiredQuantity: {
      type: Number,
      default: 2,
      min: 2
    },

    discountMode: {
      type: String,
      required: true,
      enum: [
        "fixed_bundle_price",
        "percentage_off",
        "fixed_amount_off",
        "none"
      ],
      default: "fixed_bundle_price"
    },

    discountValue: {
      type: Number,
      default: 0,
      min: 0
    },

    freeShipping: {
      type: Boolean,
      default: false
    },

    allowMultipleApplications: {
      type: Boolean,
      default: true
    },

    maximumApplicationsPerOrder: {
      type: Number,
      default: null,
      min: 1
    },

    priority: {
      type: Number,
      default: 0,
      index: true
    },

    startsAt: {
      type: Date,
      default: null,
      index: true
    },

    endsAt: {
      type: Date,
      default: null,
      index: true
    },

    isActive: {
      type: Boolean,
      default: true,
      index: true
    },

    usedOrderCount: {
      type: Number,
      default: 0,
      min: 0
    },

    applicationCount: {
      type: Number,
      default: 0,
      min: 0
    },

    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Admin",
      default: null
    },

    updatedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Admin",
      default: null
    }
  },
  {
    timestamps: true
  }
);

bundleOfferSchema.pre(
  "validate",
  function prepareBundleOffer() {
    if (
      this.startsAt &&
      this.endsAt &&
      this.endsAt <= this.startsAt
    ) {
      throw new Error(
        "Offer expiry date must be after its start date"
      );
    }

    if (
      this.discountMode === "percentage_off" &&
      (this.discountValue <= 0 ||
        this.discountValue > 100)
    ) {
      throw new Error(
        "Percentage discount must be between 1 and 100"
      );
    }

    if (
      [
        "fixed_bundle_price",
        "fixed_amount_off"
      ].includes(this.discountMode) &&
      this.discountValue <= 0
    ) {
      throw new Error(
        "The offer value must be greater than zero"
      );
    }

    if (
      this.discountMode === "none" &&
      !this.freeShipping
    ) {
      throw new Error(
        "An offer must provide a discount or free delivery"
      );
    }

    if (!this.allowMultipleApplications) {
      this.maximumApplicationsPerOrder = 1;
    }

    if (this.type === "any_n") {
      this.bundleItems = [];

      if (this.requiredQuantity < 2) {
        throw new Error(
          "The required quantity must be at least 2"
        );
      }

      if (this.scope === "all_products") {
        this.products = [];
        this.categories = [];
      }

      if (this.scope === "selected_products") {
        this.categories = [];

        if (!this.products.length) {
          throw new Error(
            "Choose at least one eligible product"
          );
        }
      }

      if (this.scope === "selected_categories") {
        this.products = [];

        if (!this.categories.length) {
          throw new Error(
            "Choose at least one eligible category"
          );
        }
      }
    }

    if (this.type === "fixed_products") {
      if (!this.bundleItems.length) {
        throw new Error(
          "Choose the products included in this bundle"
        );
      }

      const totalRequiredQuantity =
        this.bundleItems.reduce(
          (total, item) =>
            total + Number(item.quantity || 0),
          0
        );

      if (totalRequiredQuantity < 2) {
        throw new Error(
          "A fixed bundle must contain at least two total items"
        );
      }

      this.requiredQuantity = totalRequiredQuantity;
      this.scope = "selected_products";

      this.products = this.bundleItems.map(
        (item) => item.product
      );

      this.categories = [];
    }
  }
);

bundleOfferSchema.index({
  isActive: 1,
  priority: -1,
  startsAt: 1,
  endsAt: 1
});

const BundleOffer =
  mongoose.models.BundleOffer ||
  mongoose.model(
    "BundleOffer",
    bundleOfferSchema
  );

export default BundleOffer;