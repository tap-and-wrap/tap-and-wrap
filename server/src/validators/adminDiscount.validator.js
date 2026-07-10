import { z } from "zod";

function nullablePositiveNumber() {
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
    z.number().positive().nullable()
  );
}

function nullablePositiveInteger() {
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

function nullableDateString() {
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

export const createAdminDiscountSchema = z.object({
  name: z
    .string()
    .trim()
    .min(2, "Discount name is required")
    .max(150),

  code: z
    .string()
    .trim()
    .min(2, "Discount code is required")
    .max(50)
    .regex(
      /^[A-Za-z0-9_-]+$/,
      "Use letters, numbers, dashes, or underscores only"
    ),

  description: z
    .string()
    .trim()
    .max(1000)
    .optional()
    .default(""),

  type: z.enum([
    "percentage",
    "fixed",
    "free_shipping"
  ]),

  value: z.coerce
    .number()
    .min(0)
    .optional()
    .default(0),

  minimumSubtotal: z.coerce
    .number()
    .min(0)
    .optional()
    .default(0),

  maximumDiscount:
    nullablePositiveNumber(),

  usageLimit:
    nullablePositiveInteger(),

  usageLimitPerCustomer:
    nullablePositiveInteger(),

  scope: z
    .enum([
      "all_products",
      "selected_products",
      "selected_categories"
    ])
    .optional()
    .default("all_products"),

  productIds: z
    .array(z.string().trim().min(1))
    .optional()
    .default([]),

  categoryIds: z
    .array(z.string().trim().min(1))
    .optional()
    .default([]),

  startsAt: nullableDateString(),
  endsAt: nullableDateString(),

  isActive: z
    .boolean()
    .optional()
    .default(true)
});

export const updateAdminDiscountSchema =
  createAdminDiscountSchema.partial();