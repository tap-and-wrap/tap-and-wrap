function normalizeText(value) {
  return String(value || "")
    .trim()
    .toLowerCase();
}

function toSafeMoney(value, fallback) {
  const number = Number(value);

  if (!Number.isFinite(number) || number < 0) {
    return fallback;
  }

  return Math.round(number * 100) / 100;
}

function toSafeInteger(value, fallback) {
  const number = Number.parseInt(value, 10);

  if (!Number.isFinite(number) || number < 0) {
    return fallback;
  }

  return number;
}

function normalizePhone(value, fallback = "") {
  const normalized = String(value || "").trim();

  return normalized || fallback;
}

export const BOX_COLORS = [
  "Black",
  "Pink",
  "White",
  "Brown",
  "Gold"
];

export const RIBBON_COLORS = [
  "Black",
  "Red",
  "White",
  "Gold",
  "Pink"
];

export const WRAPPING_PRICES = {
  basePrice: 80,
  giftCardPrice: 35,
  textOnBoxPrice: 50,
  fillersPrice: 45
};

export const SHIPPING_PRICES = {
  cairoAndGiza: 80,
  otherGovernorates: 120
};

export const DEFAULT_LOW_STOCK_THRESHOLD = 5;

export function isPaymobConfigured() {
  return Boolean(
    process.env.PAYMOB_API_KEY &&
      process.env.PAYMOB_INTEGRATION_ID_CARD &&
      process.env.PAYMOB_IFRAME_ID &&
      process.env.PAYMOB_HMAC_SECRET
  );
}

export function buildDefaultStoreSettings() {
  const instapayHandle = String(
    process.env.INSTAPAY_HANDLE || ""
  ).trim();

  const vodafoneCashNumber = String(
    process.env.VODAFONE_CASH_NUMBER || ""
  ).trim();

  return {
    contact: {
      whatsappNumber: normalizePhone(
        process.env.WHATSAPP_NUMBER,
        "+201508216472"
      )
    },

    shipping: {
      cairoAndGiza: toSafeMoney(
        process.env.SHIPPING_CAIRO_GIZA,
        SHIPPING_PRICES.cairoAndGiza
      ),

      otherGovernorates: toSafeMoney(
        process.env.SHIPPING_OTHER_GOVERNORATES,
        SHIPPING_PRICES.otherGovernorates
      )
    },

    paymentMethods: {
      cod: {
        enabled: true
      },

      instapay: {
        enabled: Boolean(instapayHandle),
        handle: instapayHandle
      },

      vodafoneCash: {
        enabled: Boolean(vodafoneCashNumber),
        number: vodafoneCashNumber
      },

      card: {
        enabled: isPaymobConfigured()
      }
    },

    inventory: {
      lowStockThreshold: toSafeInteger(
        process.env.LOW_STOCK_THRESHOLD,
        DEFAULT_LOW_STOCK_THRESHOLD
      )
    }
  };
}

let runtimeStoreSettings =
  buildDefaultStoreSettings();

function normalizeStoreSettings(settings = {}) {
  const defaults = buildDefaultStoreSettings();

  return {
    contact: {
      whatsappNumber: normalizePhone(
        settings.contact?.whatsappNumber,
        defaults.contact.whatsappNumber
      )
    },

    shipping: {
      cairoAndGiza: toSafeMoney(
        settings.shipping?.cairoAndGiza,
        defaults.shipping.cairoAndGiza
      ),

      otherGovernorates: toSafeMoney(
        settings.shipping?.otherGovernorates,
        defaults.shipping.otherGovernorates
      )
    },

    paymentMethods: {
      cod: {
        enabled:
          settings.paymentMethods?.cod?.enabled !==
          false
      },

      instapay: {
        enabled: Boolean(
          settings.paymentMethods?.instapay?.enabled
        ),

        handle: String(
          settings.paymentMethods?.instapay?.handle ||
            ""
        ).trim()
      },

      vodafoneCash: {
        enabled: Boolean(
          settings.paymentMethods?.vodafoneCash
            ?.enabled
        ),

        number: String(
          settings.paymentMethods?.vodafoneCash
            ?.number || ""
        ).trim()
      },

      card: {
        enabled: Boolean(
          settings.paymentMethods?.card?.enabled
        )
      }
    },

    inventory: {
      lowStockThreshold: toSafeInteger(
        settings.inventory?.lowStockThreshold,
        defaults.inventory.lowStockThreshold
      )
    }
  };
}

export function setRuntimeStoreSettings(settings) {
  runtimeStoreSettings =
    normalizeStoreSettings(settings);

  return getRuntimeStoreSettings();
}

export function resetRuntimeStoreSettings() {
  runtimeStoreSettings =
    buildDefaultStoreSettings();

  return getRuntimeStoreSettings();
}

export function getRuntimeStoreSettings() {
  return normalizeStoreSettings(
    runtimeStoreSettings
  );
}

export function isCairoOrGiza(governorate) {
  const normalizedGovernorate =
    normalizeText(governorate);

  return [
    "cairo",
    "giza",
    "greater cairo",
    "القاهرة",
    "الجيزة"
  ].includes(normalizedGovernorate);
}

export function calculateShippingFee(
  governorate
) {
  const normalizedGovernorate =
    normalizeText(governorate);

  if (!normalizedGovernorate) {
    return 0;
  }

  const shipping =
    getRuntimeStoreSettings().shipping;

  return isCairoOrGiza(governorate)
    ? shipping.cairoAndGiza
    : shipping.otherGovernorates;
}

export function calculateWrappingTotal(
  wrapping = {}
) {
  if (!wrapping.enabled) {
    return {
      basePrice: 0,
      giftCardPrice: 0,
      textOnBoxPrice: 0,
      fillersPrice: 0,
      total: 0
    };
  }

  const basePrice =
    WRAPPING_PRICES.basePrice;

  const giftCardPrice =
    wrapping.giftCard
      ? WRAPPING_PRICES.giftCardPrice
      : 0;

  const textOnBoxPrice =
    wrapping.textOnBox
      ? WRAPPING_PRICES.textOnBoxPrice
      : 0;

  const fillersPrice =
    wrapping.fillers
      ? WRAPPING_PRICES.fillersPrice
      : 0;

  return {
    basePrice,
    giftCardPrice,
    textOnBoxPrice,
    fillersPrice,

    total:
      basePrice +
      giftCardPrice +
      textOnBoxPrice +
      fillersPrice
  };
}

export function getPublicStoreConfig(
  settings = runtimeStoreSettings
) {
  const normalizedSettings =
    normalizeStoreSettings(settings);

  const paymobConfigured =
    isPaymobConfigured();

  return {
    currency: "EGP",

    contact: {
      whatsappNumber:
        normalizedSettings.contact
          .whatsappNumber
    },

    shipping: {
      cairoAndGiza:
        normalizedSettings.shipping
          .cairoAndGiza,

      otherGovernorates:
        normalizedSettings.shipping
          .otherGovernorates
    },

    wrapping: {
      boxColors: BOX_COLORS,
      ribbonColors: RIBBON_COLORS,
      prices: WRAPPING_PRICES
    },

    paymentMethods: {
      cod: {
        enabled:
          normalizedSettings
            .paymentMethods.cod.enabled,

        label:
          "Cash on Delivery"
      },

      instapay: {
        enabled:
          normalizedSettings
            .paymentMethods.instapay
            .enabled &&
          Boolean(
            normalizedSettings
              .paymentMethods.instapay
              .handle
          ),

        label: "InstaPay",

        handle:
          normalizedSettings
            .paymentMethods.instapay
            .handle
      },

      vodafoneCash: {
        enabled:
          normalizedSettings
            .paymentMethods.vodafoneCash
            .enabled &&
          Boolean(
            normalizedSettings
              .paymentMethods.vodafoneCash
              .number
          ),

        label:
          "Vodafone Cash",

        number:
          normalizedSettings
            .paymentMethods.vodafoneCash
            .number
      },

      card: {
        enabled:
          normalizedSettings
            .paymentMethods.card.enabled &&
          paymobConfigured,

        configured:
          paymobConfigured,

        label:
          "Visa / Mastercard through Paymob"
      }
    }
  };
}
