import mongoose from "mongoose";

const discountCodeSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: [true, "Discount name is required"],
      trim: true,
      maxlength: [
        150,
        "Discount name cannot exceed 150 characters"
      ]
    },

    code: {
      type: String,
      required: [true, "Discount code is required"],
      unique: true,
      uppercase: true,
      trim: true,
      index: true,
      maxlength: [
        50,
        "Discount code cannot exceed 50 characters"
      ]
    },

    description: {
      type: String,
      default: "",
      trim: true,
      maxlength: [
        1000,
        "Description cannot exceed 1000 characters"
      ]
    },

    type: {
      type: String,
      required: true,
      enum: [
        "percentage",
        "fixed",
        "free_shipping"
      ]
    },

    value: {
      type: Number,
      default: 0,
      min: [0, "Discount value cannot be negative"]
    },

    minimumSubtotal: {
      type: Number,
      default: 0,
      min: [
        0,
        "Minimum subtotal cannot be negative"
      ]
    },

    maximumDiscount: {
      type: Number,
      default: null,
      min: [
        0,
        "Maximum discount cannot be negative"
      ]
    },

    usageLimit: {
      type: Number,
      default: null,
      min: [
        1,
        "Usage limit must be at least 1"
      ]
    },

    usageLimitPerCustomer: {
      type: Number,
      default: null,
      min: [
        1,
        "Customer usage limit must be at least 1"
      ]
    },

    usedCount: {
      type: Number,
      default: 0,
      min: 0
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

discountCodeSchema.pre(
  "validate",
  function prepareDiscountCode() {
    if (this.code) {
      this.code = String(this.code)
        .trim()
        .toUpperCase()
        .replace(/\s+/g, "");
    }

    if (this.type === "percentage") {
      if (this.value <= 0 || this.value > 100) {
        throw new Error(
          "Percentage discount must be between 1 and 100"
        );
      }
    }

    if (this.type === "fixed") {
      if (this.value <= 0) {
        throw new Error(
          "Fixed discount must be greater than zero"
        );
      }
    }

    if (this.type === "free_shipping") {
      this.value = 0;
      this.maximumDiscount = null;
    }

    if (
      this.startsAt &&
      this.endsAt &&
      this.endsAt <= this.startsAt
    ) {
      throw new Error(
        "Discount expiry date must be after its start date"
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
          "Choose at least one product for this discount"
        );
      }
    }

    if (this.scope === "selected_categories") {
      this.products = [];

      if (!this.categories.length) {
        throw new Error(
          "Choose at least one category for this discount"
        );
      }
    }
  }
);

discountCodeSchema.index({
  isActive: 1,
  startsAt: 1,
  endsAt: 1
});

const DiscountCode =
  mongoose.models.DiscountCode ||
  mongoose.model(
    "DiscountCode",
    discountCodeSchema
  );

export default DiscountCode;