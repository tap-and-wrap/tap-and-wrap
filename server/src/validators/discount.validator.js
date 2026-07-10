import { z } from "zod";

import {
  orderItemSchema
} from "./order.validator.js";

export const validateDiscountSchema =
  z.object({
    code: z
      .string()
      .trim()
      .min(
        1,
        "Enter a discount code"
      )
      .max(50),

    customerEmail: z
      .string()
      .trim()
      .email()
      .or(z.literal(""))
      .optional()
      .default(""),

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

    items: z
      .array(orderItemSchema)
      .min(1)
      .max(50)
  });