import { z } from "zod";

const moneySchema = z.coerce
  .number()
  .min(0)
  .max(10000);

const phoneSchema = z
  .string()
  .trim()
  .min(
    8,
    "Enter a valid WhatsApp number"
  )
  .max(40)
  .regex(
    /^\+?[0-9\s-]+$/,
    "Use numbers only"
  );

export const updateAdminStoreSettingsSchema =
  z.object({
    contact: z.object({
      whatsappNumber:
        phoneSchema
    }),

    shipping: z.object({
      cairoAndGiza:
        moneySchema,

      otherGovernorates:
        moneySchema
    }),

    paymentMethods: z.object({
      cod: z.object({
        enabled:
          z.boolean()
      }),

      instapay: z.object({
        enabled:
          z.boolean(),

        handle: z
          .string()
          .trim()
          .max(150)
          .optional()
          .default("")
      }),

      vodafoneCash:
        z.object({
          enabled:
            z.boolean(),

          number: z
            .string()
            .trim()
            .max(40)
            .optional()
            .default("")
        }),

      card: z.object({
        enabled:
          z.boolean()
      })
    }),

    inventory: z.object({
      lowStockThreshold:
        z.coerce
          .number()
          .int()
          .min(0)
          .max(100000)
    })
  });
