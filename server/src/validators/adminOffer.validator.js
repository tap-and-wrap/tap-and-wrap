import { z } from "zod";

function nullablePositiveIntegerSchema() {
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
    z.number().int().min(1).nullable()
  );
}

function nullableDateSchema() {
  return z.preprocess(
    (value) => {
      if (
        value === "" ||
        value === null ||
        value === undefined
      ) {
        return null;
      }

      return value;
    },
    z
      .string()
      .datetime({
        offset: true
      })
      .nullable()
  );
}

const bundleItemSchema = z.object({
  productId: z
    .string()
    .trim()
    .min(1),

  quantity: z.coerce
    .number()
    .int()
    .min(1)
    .max(100)
});

export const createAdminOfferSchema = z.object({
  name: z
    .string()
    .trim()
    .min(2, "Offer name is required")
    .max(150),

  description: z
    .string()
    .trim()
    .max(1500)
    .optional()
    .default(""),

  type: z.enum([
    "any_n",
    "fixed_products"
  ]),

  scope: z
    .enum([
      "all_products",
      "selected_products",
      "selected_categories"
    ])
    .optional()
    .default("selected_products"),

  productIds: z
    .array(
      z.string().trim().min(1)
    )
    .optional()
    .default([]),

  categoryIds: z
    .array(
      z.string().trim().min(1)
    )
    .optional()
    .default([]),

  bundleItems: z
    .array(bundleItemSchema)
    .optional()
    .default([]),

  requiredQuantity: z.coerce
    .number()
    .int()
    .min(2)
    .max(100)
    .optional()
    .default(2),

  discountMode: z.enum([
    "fixed_bundle_price",
    "percentage_off",
    "fixed_amount_off",
    "none"
  ]),

  discountValue: z.coerce
    .number()
    .min(0)
    .optional()
    .default(0),

  freeShipping: z
    .boolean()
    .optional()
    .default(false),

  allowMultipleApplications: z
    .boolean()
    .optional()
    .default(true),

  maximumApplicationsPerOrder:
    nullablePositiveIntegerSchema(),

  priority: z.coerce
    .number()
    .int()
    .min(-10000)
    .max(10000)
    .optional()
    .default(0),

  startsAt: nullableDateSchema(),
  endsAt: nullableDateSchema(),

  isActive: z
    .boolean()
    .optional()
    .default(true)
});

export const updateAdminOfferSchema =
  createAdminOfferSchema.partial();