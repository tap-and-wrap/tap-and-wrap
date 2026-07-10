import { z } from "zod";

const imageSchema = z.object({
  url: z
    .string()
    .trim()
    .max(1000)
    .optional()
    .default(""),

  publicId: z
    .string()
    .trim()
    .max(500)
    .optional()
    .default(""),

  alt: z
    .string()
    .trim()
    .max(200)
    .optional()
    .default("")
});

const serviceDefaultsSchema = z.object({
  engraving: z.boolean().optional().default(false),
  wrapping: z.boolean().optional().default(true),
  photoPrinting: z.boolean().optional().default(false)
});

export const createAdminCategorySchema = z.object({
  name: z
    .string()
    .trim()
    .min(2, "Category name must contain at least 2 characters")
    .max(120),

  slug: z
    .string()
    .trim()
    .max(150)
    .optional()
    .default(""),

  description: z
    .string()
    .trim()
    .max(1000)
    .optional()
    .default(""),

  parentId: z
    .string()
    .trim()
    .max(100)
    .nullable()
    .optional()
    .default(null),

  sortOrder: z.coerce
    .number()
    .int()
    .min(-10000)
    .max(10000)
    .optional()
    .default(0),

  showInMenu: z.boolean().optional().default(true),
  showOnHome: z.boolean().optional().default(false),
  isActive: z.boolean().optional().default(true),

  serviceDefaults: serviceDefaultsSchema
    .optional()
    .default({
      engraving: false,
      wrapping: true,
      photoPrinting: false
    }),

  image: imageSchema
    .optional()
    .default({
      url: "",
      publicId: "",
      alt: ""
    })
});

export const updateAdminCategorySchema =
  createAdminCategorySchema.partial();