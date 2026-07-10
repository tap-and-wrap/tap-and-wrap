import { z } from "zod";

import { orderItemSchema } from "./order.validator.js";

export const previewPricingSchema = z.object({
  items: z.array(orderItemSchema).min(1).max(50),

  shippingAddress: z
    .object({
      governorate: z
        .string()
        .trim()
        .max(100)
        .optional()
        .default("")
    })
    .optional()
    .default({
      governorate: ""
    }),

  customerEmail: z
    .string()
    .trim()
    .email()
    .or(z.literal(""))
    .optional()
    .default(""),

  discountCode: z
    .string()
    .trim()
    .max(50)
    .optional()
    .default("")
});
