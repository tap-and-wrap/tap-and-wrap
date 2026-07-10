import { z } from "zod";

export const retryCardPaymentSchema =
  z.object({
    orderNumber: z
      .string()
      .trim()
      .min(5)
      .max(60)
      .transform((value) =>
        value.toUpperCase()
      ),

    email: z
      .string()
      .trim()
      .email()
      .max(150)
      .transform((value) =>
        value.toLowerCase()
      )
  });

export const paymentResultSchema =
  z.object({
    orderNumber: z
      .string()
      .trim()
      .min(5)
      .max(60),

    transactionId: z
      .string()
      .trim()
      .min(1)
      .max(100),

    status: z
      .string()
      .trim()
      .min(1)
      .max(40),

    signature: z
      .string()
      .trim()
      .regex(
        /^[a-fA-F0-9]{64}$/,
        "Invalid payment result signature"
      )
  });
