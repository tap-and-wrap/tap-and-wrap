import { z } from "zod";

const phoneSchema = z
  .string()
  .trim()
  .min(
    8,
    "Enter a valid phone number"
  )
  .max(
    20,
    "Phone number is too long"
  )
  .regex(
    /^\+?[0-9\s-]+$/,
    "Phone number contains invalid characters"
  );

const nullableNumberSchema =
  z.preprocess(
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

    z.number().min(0).nullable()
  );

const nullableDateSchema =
  z.preprocess(
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
      .refine(
        (value) =>
          !Number.isNaN(
            new Date(value).getTime()
          ),
        "Needed-by date is invalid"
      )
      .nullable()
  );

const referenceImageSchema =
  z
    .object({
      imageUrl: z
        .string()
        .trim()
        .url()
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
    .nullable()
    .optional()
    .default(null);

export const createServiceRequestSchema =
  z.object({
    serviceType: z.enum([
      "engraving",
      "gift_wrapping",
      "photo_printing",
      "custom_gift",
      "corporate_gifting",
      "other"
    ]),

    customer: z.object({
      fullName: z
        .string()
        .trim()
        .min(
          2,
          "Enter your full name"
        )
        .max(100),

      email: z
        .string()
        .trim()
        .email(
          "Enter a valid email address"
        )
        .max(150),

      phone: phoneSchema,

      whatsappNumber:
        phoneSchema
          .or(z.literal(""))
          .optional()
          .default("")
    }),

    title: z
      .string()
      .trim()
      .min(
        3,
        "Enter a short request title"
      )
      .max(200),

    description: z
      .string()
      .trim()
      .min(
        10,
        "Describe the service you need"
      )
      .max(5000),

    quantity: z.coerce
      .number()
      .int()
      .min(1)
      .max(10000)
      .optional()
      .default(1),

    budget:
      nullableNumberSchema,

    neededBy:
      nullableDateSchema,

    referenceImage:
      referenceImageSchema
  });

export const updateAdminServiceRequestSchema =
  z.object({
    status: z.enum([
      "new",
      "contacted",
      "quoted",
      "approved",
      "in_progress",
      "completed",
      "cancelled"
    ]),

    quotedPrice:
      nullableNumberSchema,

    adminNote: z
      .string()
      .trim()
      .max(5000)
      .optional()
      .default(""),

    statusNote: z
      .string()
      .trim()
      .max(1000)
      .optional()
      .default("")
  });