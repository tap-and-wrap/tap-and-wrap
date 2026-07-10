import mongoose from "mongoose";

import { createSlug } from "../utils/slug.js";

const productImageSchema = new mongoose.Schema(
  {
    url: {
      type: String,
      required: true,
      trim: true
    },

    publicId: {
      type: String,
      required: true,
      trim: true
    },

    alt: {
      type: String,
      default: "",
      trim: true,
      maxlength: 200
    },

    isMain: {
      type: Boolean,
      default: false
    },

    sortOrder: {
      type: Number,
      default: 0
    }
  },
  {
    _id: true
  }
);

const variantOptionSchema = new mongoose.Schema(
  {
    label: {
      type: String,
      required: true,
      trim: true
    },

    value: {
      type: String,
      required: true,
      trim: true
    },

    priceAdjustment: {
      type: Number,
      default: 0
    },

    stock: {
      type: Number,
      default: 0,
      min: 0
    },

    sku: {
      type: String,
      default: "",
      trim: true
    }
  },
  {
    _id: true
  }
);

const variantSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: true,
      trim: true
    },

    options: {
      type: [variantOptionSchema],
      default: []
    }
  },
  {
    _id: true
  }
);

const serviceEligibilitySchema = new mongoose.Schema(
  {
    engraving: {
      type: Boolean,
      default: false
    },

    wrapping: {
      type: Boolean,
      default: true
    },

    photoPrinting: {
      type: Boolean,
      default: false
    }
  },
  {
    _id: false
  }
);

const engravingSettingsSchema = new mongoose.Schema(
  {
    allowText: {
      type: Boolean,
      default: true
    },

    allowImage: {
      type: Boolean,
      default: false
    },

    maxCharacters: {
      type: Number,
      default: 80,
      min: 1,
      max: 500
    },

    placements: {
      type: [String],
      default: []
    },

    basePrice: {
      type: Number,
      default: 0,
      min: 0
    },

    notes: {
      type: String,
      default: "",
      trim: true,
      maxlength: 1000
    }
  },
  {
    _id: false
  }
);

const productSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: [true, "Product name is required"],
      trim: true,
      maxlength: [
        200,
        "Product name cannot exceed 200 characters"
      ]
    },

    slug: {
      type: String,
      required: true,
      unique: true,
      lowercase: true,
      trim: true,
      index: true
    },

    sku: {
      type: String,
      default: "",
      trim: true,
      index: true
    },

    shortDescription: {
      type: String,
      default: "",
      trim: true,
      maxlength: 500
    },

    description: {
      type: String,
      default: "",
      trim: true,
      maxlength: 10000
    },

    price: {
      type: Number,
      required: [true, "Product price is required"],
      min: [0, "Product price cannot be negative"]
    },

    salePrice: {
      type: Number,
      default: null,
      min: [0, "Sale price cannot be negative"],

      validate: {
        validator(value) {
          return (
            value === null ||
            value === undefined ||
            value <= this.price
          );
        },

        message:
          "Sale price cannot be greater than the regular price"
      }
    },

    stock: {
      type: Number,
      default: 0,
      min: [0, "Stock cannot be negative"]
    },

    category: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Category",
      required: true,
      index: true
    },

    subcategory: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Category",
      default: null,
      index: true
    },

    images: {
      type: [productImageSchema],
      default: []
    },

    variants: {
      type: [variantSchema],
      default: []
    },

    serviceEligibility: {
      type: serviceEligibilitySchema,
      default: () => ({})
    },

    engravingSettings: {
      type: engravingSettingsSchema,
      default: () => ({})
    },

    tags: {
      type: [String],
      default: []
    },

    occasions: {
      type: [String],
      default: []
    },

    badges: {
      type: [String],
      default: []
    },

    isFeatured: {
      type: Boolean,
      default: false,
      index: true
    },

    isBestSeller: {
      type: Boolean,
      default: false,
      index: true
    },

    isFlashSale: {
      type: Boolean,
      default: false,
      index: true
    },

    isActive: {
      type: Boolean,
      default: true,
      index: true
    },

    seoTitle: {
      type: String,
      default: "",
      trim: true,
      maxlength: 200
    },

    seoDescription: {
      type: String,
      default: "",
      trim: true,
      maxlength: 500
    }
  },
  {
    timestamps: true,

    toJSON: {
      virtuals: true
    },

    toObject: {
      virtuals: true
    }
  }
);

productSchema.pre("validate", function prepareProduct() {
  if (!this.slug && this.name) {
    this.slug = createSlug(this.name);
  } else if (this.isModified("slug")) {
    this.slug = createSlug(this.slug);
  }

  if (
    this.salePrice === "" ||
    this.salePrice === undefined
  ) {
    this.salePrice = null;
  }

  if (this.images?.length) {
    const sortedImages = [...this.images].sort(
      (first, second) =>
        Number(first.sortOrder || 0) -
        Number(second.sortOrder || 0)
    );

    let mainImageFound = false;

    sortedImages.forEach((image, index) => {
      image.sortOrder = index;

      if (image.isMain && !mainImageFound) {
        mainImageFound = true;
      } else {
        image.isMain = false;
      }
    });

    if (!mainImageFound) {
      sortedImages[0].isMain = true;
    }

    this.images = sortedImages;
  }
});

productSchema.virtual("currentPrice").get(function getCurrentPrice() {
  if (
    typeof this.salePrice === "number" &&
    this.salePrice < this.price
  ) {
    return this.salePrice;
  }

  return this.price;
});

productSchema.virtual("mainImage").get(function getMainImage() {
  if (!this.images?.length) {
    return null;
  }

  const sortedImages = [...this.images].sort(
    (first, second) =>
      Number(first.sortOrder || 0) -
      Number(second.sortOrder || 0)
  );

  return (
    sortedImages.find((image) => image.isMain) ||
    sortedImages[0]
  );
});

productSchema.virtual("hoverImage").get(function getHoverImage() {
  if (!this.images?.length) {
    return null;
  }

  const sortedImages = [...this.images].sort(
    (first, second) =>
      Number(first.sortOrder || 0) -
      Number(second.sortOrder || 0)
  );

  const mainImage =
    sortedImages.find((image) => image.isMain) ||
    sortedImages[0];

  return (
    sortedImages.find(
      (image) =>
        String(image.publicId) !==
        String(mainImage.publicId)
    ) || null
  );
});

productSchema.index({
  name: "text",
  shortDescription: "text",
  description: "text",
  tags: "text",
  occasions: "text"
});

productSchema.index({
  isActive: 1,
  createdAt: -1
});

const Product =
  mongoose.models.Product ||
  mongoose.model("Product", productSchema);

export default Product;