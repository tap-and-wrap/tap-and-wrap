import { z } from "zod";

function nullableNumberSchema(minimum = 0) {
  return z.preprocess(
    (value) => {
      if (
        value === "" ||
        value === null ||
        value === undefined
      ) {
        return null;
      }

      return Number(value);
    },

    z.number().min(minimum).nullable()
  );
}

const imageSchema = z.object({
  url: z
    .string()
    .trim()
    .url("Product image URL is invalid")
    .max(1000),

  publicId: z
    .string()
    .trim()
    .min(1)
    .max(500),

  alt: z
    .string()
    .trim()
    .max(200)
    .optional()
    .default(""),

  isMain: z.boolean().optional().default(false),

  sortOrder: z.coerce
    .number()
    .int()
    .min(0)
    .optional()
    .default(0)
});

const serviceEligibilitySchema = z.object({
  engraving: z.boolean().optional().default(false),
  wrapping: z.boolean().optional().default(true),
  photoPrinting: z.boolean().optional().default(false)
});

const engravingSettingsSchema = z.object({
  allowText: z.boolean().optional().default(true),
  allowImage: z.boolean().optional().default(false),

  maxCharacters: z.coerce
    .number()
    .int()
    .min(1)
    .max(500)
    .optional()
    .default(80),

  placements: z
    .array(z.string().trim().min(1).max(100))
    .optional()
    .default([]),

  basePrice: z.coerce
    .number()
    .min(0)
    .optional()
    .default(0),

  notes: z
    .string()
    .trim()
    .max(1000)
    .optional()
    .default("")
});

const stringArraySchema = z
  .array(z.string().trim().min(1).max(150))
  .optional()
  .default([]);

export const createAdminProductSchema = z.object({
  name: z
    .string()
    .trim()
    .min(2, "Product name is required")
    .max(200),

  slug: z
    .string()
    .trim()
    .max(250)
    .optional()
    .default(""),

  sku: z
    .string()
    .trim()
    .max(150)
    .optional()
    .default(""),

  shortDescription: z
    .string()
    .trim()
    .max(500)
    .optional()
    .default(""),

  description: z
    .string()
    .trim()
    .max(10000)
    .optional()
    .default(""),

  price: z.coerce
    .number()
    .min(0),

  salePrice: nullableNumberSchema(0),

  stock: z.coerce
    .number()
    .int()
    .min(0)
    .optional()
    .default(0),

  categoryId: z
    .string()
    .trim()
    .min(1, "Category is required"),

  subcategoryId: z
    .string()
    .trim()
    .nullable()
    .optional()
    .default(null),

  images: z
    .array(imageSchema)
    .optional()
    .default([]),

  serviceEligibility: serviceEligibilitySchema
    .optional()
    .default({
      engraving: false,
      wrapping: true,
      photoPrinting: false
    }),

  engravingSettings: engravingSettingsSchema
    .optional()
    .default({
      allowText: true,
      allowImage: false,
      maxCharacters: 80,
      placements: [],
      basePrice: 0,
      notes: ""
    }),

  tags: stringArraySchema,
  occasions: stringArraySchema,
  badges: stringArraySchema,

  isFeatured: z.boolean().optional().default(false),
  isBestSeller: z.boolean().optional().default(false),
  isFlashSale: z.boolean().optional().default(false),
  isActive: z.boolean().optional().default(true),

  seoTitle: z
    .string()
    .trim()
    .max(200)
    .optional()
    .default(""),

  seoDescription: z
    .string()
    .trim()
    .max(500)
    .optional()
    .default("")
});

export const updateAdminProductSchema =
  createAdminProductSchema.partial();