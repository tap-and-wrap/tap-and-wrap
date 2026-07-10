import { z } from "zod";

export const updateOrderStatusSchema = z.object({
  status: z.enum([
    "pending",
    "confirmed",
    "preparing",
    "ready",
    "out_for_delivery",
    "delivered",
    "cancelled"
  ]),

  internalNote: z
    .string()
    .trim()
    .max(2000)
    .optional()
    .default(""),

  cancellationReason: z
    .string()
    .trim()
    .max(1000)
    .optional()
    .default("")
});

export const updatePaymentStatusSchema = z.object({
  status: z.enum([
    "unpaid",
    "pending_review",
    "paid",
    "failed",
    "refunded"
  ]),

  transactionId: z
    .string()
    .trim()
    .max(300)
    .optional()
    .default(""),

  note: z
    .string()
    .trim()
    .max(1000)
    .optional()
    .default("")
});