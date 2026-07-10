import {
  getPublicStoreConfig,
  isPaymobConfigured
} from "../config/storeConfig.js";

import {
  asyncHandler
} from "../utils/asyncHandler.js";

import {
  createHttpError
} from "../utils/httpError.js";

import {
  getStoreSettingsDocument,
  updateStoreSettingsCache
} from "../services/storeSettings.service.js";

import {
  updateAdminStoreSettingsSchema
} from "../validators/adminStoreSettings.validator.js";

function serializeAdminSettings(
  settings
) {
  const plain =
    typeof settings?.toObject ===
    "function"
      ? settings.toObject()
      : settings;

  const paymobConfigured =
    isPaymobConfigured();

  return {
    _id: plain._id,

    contact: {
      whatsappNumber:
        plain.contact
          .whatsappNumber
    },

    shipping: {
      cairoAndGiza:
        plain.shipping
          .cairoAndGiza,

      otherGovernorates:
        plain.shipping
          .otherGovernorates
    },

    paymentMethods: {
      cod: {
        enabled:
          plain.paymentMethods
            .cod.enabled
      },

      instapay: {
        enabled:
          plain.paymentMethods
            .instapay.enabled,

        handle:
          plain.paymentMethods
            .instapay.handle
      },

      vodafoneCash: {
        enabled:
          plain.paymentMethods
            .vodafoneCash.enabled,

        number:
          plain.paymentMethods
            .vodafoneCash.number
      },

      card: {
        enabled:
          paymobConfigured &&
          plain.paymentMethods
            .card.enabled,

        configured:
          paymobConfigured
      }
    },

    inventory: {
      lowStockThreshold:
        plain.inventory
          .lowStockThreshold
    },

    updatedAt:
      plain.updatedAt
  };
}

function validatePaymentSettings(
  payload
) {
  if (
    payload.paymentMethods
      .instapay.enabled &&
    !payload.paymentMethods
      .instapay.handle
  ) {
    throw createHttpError(
      400,
      "Enter the InstaPay address before enabling InstaPay"
    );
  }

  if (
    payload.paymentMethods
      .vodafoneCash.enabled &&
    !payload.paymentMethods
      .vodafoneCash.number
  ) {
    throw createHttpError(
      400,
      "Enter the Vodafone Cash number before enabling Vodafone Cash"
    );
  }

  if (
    payload.paymentMethods
      .card.enabled &&
    !isPaymobConfigured()
  ) {
    throw createHttpError(
      400,
      "Paymob credentials are not configured, so card payment cannot be enabled yet"
    );
  }

  const hasPaymentMethod =
    payload.paymentMethods
      .cod.enabled ||
    payload.paymentMethods
      .instapay.enabled ||
    payload.paymentMethods
      .vodafoneCash.enabled ||
    payload.paymentMethods
      .card.enabled;

  if (!hasPaymentMethod) {
    throw createHttpError(
      400,
      "Keep at least one payment method enabled"
    );
  }
}

export const getAdminStoreSettings =
  asyncHandler(async (req, res) => {
    const settings =
      await getStoreSettingsDocument({
        forceRefresh: true
      });

    res.status(200).json({
      success: true,

      settings:
        serializeAdminSettings(
          settings
        ),

      publicConfig:
        getPublicStoreConfig(
          settings
        )
    });
  });

export const updateAdminStoreSettings =
  asyncHandler(async (req, res) => {
    const validation =
      updateAdminStoreSettingsSchema.safeParse(
        req.body
      );

    if (!validation.success) {
      throw createHttpError(
        400,
        "Invalid store settings",
        validation.error.flatten()
      );
    }

    const payload =
      validation.data;

    validatePaymentSettings(
      payload
    );

    const settings =
      await getStoreSettingsDocument({
        forceRefresh: true
      });

    settings.contact =
      payload.contact;

    settings.shipping =
      payload.shipping;

    settings.paymentMethods = {
      cod: {
        enabled:
          payload.paymentMethods
            .cod.enabled
      },

      instapay: {
        enabled:
          payload.paymentMethods
            .instapay.enabled,

        handle:
          payload.paymentMethods
            .instapay.handle
      },

      vodafoneCash: {
        enabled:
          payload.paymentMethods
            .vodafoneCash.enabled,

        number:
          payload.paymentMethods
            .vodafoneCash.number
      },

      card: {
        enabled:
          payload.paymentMethods
            .card.enabled
      }
    };

    settings.inventory =
      payload.inventory;

    settings.updatedBy =
      req.admin._id;

    await settings.save();

    updateStoreSettingsCache(
      settings
    );

    res.status(200).json({
      success: true,

      message:
        "Store settings saved successfully",

      settings:
        serializeAdminSettings(
          settings
        ),

      publicConfig:
        getPublicStoreConfig(
          settings
        )
    });
  });
