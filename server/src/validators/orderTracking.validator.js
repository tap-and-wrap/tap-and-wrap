import { z } from "zod";

export const trackOrderSchema = z.object({
  orderNumber: z
    .string()
    .trim()
    .min(
      5,
      "Enter your order number"
    )
    .max(50)
    .transform((value) =>
      value.toUpperCase()
    ),

  email: z
    .string()
    .trim()
    .email(
      "Enter the same email used during checkout"
    )
    .max(150)
    .transform((value) =>
      value.toLowerCase()
    )
});