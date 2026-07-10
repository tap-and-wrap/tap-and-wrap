import mongoose from "mongoose";

import { createSlug } from "../utils/slug.js";

const categoryImageSchema = new mongoose.Schema(
  {
    url: {
      type: String,
      default: "",
      trim: true
    },

    publicId: {
      type: String,
      default: "",
      trim: true
    },

    alt: {
      type: String,
      default: "",
      trim: true
    }
  },
  {
    _id: false
  }
);

const serviceDefaultsSchema = new mongoose.Schema(
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

const categorySchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: [true, "Category name is required"],
      trim: true,
      maxlength: [
        120,
        "Category name cannot exceed 120 characters"
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

    description: {
      type: String,
      default: "",
      trim: true,
      maxlength: [
        1000,
        "Category description cannot exceed 1000 characters"
      ]
    },

    image: {
      type: categoryImageSchema,
      default: () => ({})
    },

    parent: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Category",
      default: null,
      index: true
    },

    level: {
      type: Number,
      default: 0,
      min: 0
    },

    sortOrder: {
      type: Number,
      default: 0
    },

    showInMenu: {
      type: Boolean,
      default: true
    },

    showOnHome: {
      type: Boolean,
      default: false
    },

    serviceDefaults: {
      type: serviceDefaultsSchema,
      default: () => ({})
    },

    isActive: {
      type: Boolean,
      default: true,
      index: true
    }
  },
  {
    timestamps: true
  }
);

categorySchema.pre("validate", function generateCategorySlug() {
  if (!this.slug && this.name) {
    this.slug = createSlug(this.name);
    return;
  }

  if (this.isModified("slug")) {
    this.slug = createSlug(this.slug);
  }
});

categorySchema.index({
  parent: 1,
  sortOrder: 1,
  name: 1
});

const Category =
  mongoose.models.Category ||
  mongoose.model("Category", categorySchema);

export default Category;