import { z } from "zod";

const phoneSchema = z
  .string()
  .trim()
  .min(
    8,
    "Phone number is too short"
  )
  .max(
    20,
    "Phone number is too long"
  )
  .regex(
    /^\+?[0-9\s-]+$/,
    "Phone number contains invalid characters"
  );

const engravingSchema = z
  .object({
    enabled: z
      .boolean()
      .optional()
      .default(false),

    type: z
      .enum(["text", "image"])
      .optional()
      .default("text"),

    text: z
      .string()
      .trim()
      .max(150)
      .optional()
      .default(""),

    placement: z
      .string()
      .trim()
      .max(100)
      .optional()
      .default(""),

    imageUrl: z
      .string()
      .trim()
      .max(1000)
      .optional()
      .default(""),

    imagePublicId: z
      .string()
      .trim()
      .max(500)
      .optional()
      .default(""),

    imageFileName: z
      .string()
      .trim()
      .max(255)
      .optional()
      .default("")
  })
  .optional();

const wrappingSchema = z
  .object({
    enabled: z
      .boolean()
      .optional()
      .default(false),

    boxColor: z
      .string()
      .trim()
      .max(50)
      .optional()
      .default(""),

    ribbonColor: z
      .string()
      .trim()
      .max(50)
      .optional()
      .default(""),

    giftCard: z
      .boolean()
      .optional()
      .default(false),

    giftCardMessage: z
      .string()
      .trim()
      .max(500)
      .optional()
      .default(""),

    textOnBox: z
      .boolean()
      .optional()
      .default(false),

    boxText: z
      .string()
      .trim()
      .max(150)
      .optional()
      .default(""),

    fillers: z
      .boolean()
      .optional()
      .default(false)
  })
  .optional();

export const orderItemSchema =
  z.object({
    productId: z
      .string()
      .trim()
      .min(1),

    quantity: z
      .number()
      .int()
      .min(1)
      .max(50),

    engraving:
      engravingSchema,

    wrapping:
      wrappingSchema
  });

const paymentProofSchema = z
  .object({
    imageUrl: z
      .string()
      .trim()
      .url(
        "Payment proof URL is invalid"
      )
      .max(1000),

    imagePublicId: z
      .string()
      .trim()
      .min(1)
      .max(500),

    originalFileName: z
      .string()
      .trim()
      .max(255)
      .optional()
      .default("")
  })
  .optional();

export const createOrderSchema =
  z.object({
    customer: z.object({
      fullName: z
        .string()
        .trim()
        .min(2)
        .max(100),

      email: z
        .string()
        .trim()
        .email()
        .max(150),

      phone:
        phoneSchema,

      alternatePhone:
        phoneSchema
          .or(z.literal(""))
          .optional()
          .default("")
    }),

    shippingAddress: z.object({
      recipientName: z
        .string()
        .trim()
        .min(2)
        .max(100),

      recipientPhone:
        phoneSchema,

      governorate: z
        .string()
        .trim()
        .min(2)
        .max(100),

      city: z
        .string()
        .trim()
        .min(2)
        .max(100),

      area: z
        .string()
        .trim()
        .max(150)
        .optional()
        .default(""),

      addressLine: z
        .string()
        .trim()
        .min(5)
        .max(500),

      building: z
        .string()
        .trim()
        .max(100)
        .optional()
        .default(""),

      floor: z
        .string()
        .trim()
        .max(50)
        .optional()
        .default(""),

      apartment: z
        .string()
        .trim()
        .max(50)
        .optional()
        .default(""),

      landmark: z
        .string()
        .trim()
        .max(250)
        .optional()
        .default("")
    }),

    items: z
      .array(orderItemSchema)
      .min(
        1,
        "Order must contain at least one item"
      )
      .max(50),

    paymentMethod: z.enum([
      "cod",
      "instapay",
      "vodafone_cash",
      "card"
    ]),

    paymentProof:
      paymentProofSchema,

    discountCode: z
      .string()
      .trim()
      .max(50)
      .optional()
      .default(""),

    customerNote: z
      .string()
      .trim()
      .max(1000)
      .optional()
      .default("")
  });