import crypto from "crypto";

import {
  getPaymobConfig,
  isPaymobConfigured
} from "../config/paymob.js";

import {
  createHttpError
} from "../utils/httpError.js";

const PAYMOB_HMAC_FIELDS = [
  "amount_cents",
  "created_at",
  "currency",
  "error_occured",
  "has_parent_transaction",
  "id",
  "integration_id",
  "is_3d_secure",
  "is_auth",
  "is_capture",
  "is_refunded",
  "is_standalone_payment",
  "is_voided",
  "order",
  "owner",
  "pending",
  "source_data.pan",
  "source_data.sub_type",
  "source_data.type",
  "success"
];

function toAmountCents(value) {
  const amount = Number(value);

  if (
    !Number.isFinite(amount) ||
    amount <= 0
  ) {
    throw createHttpError(
      400,
      "The card payment amount is invalid"
    );
  }

  return Math.round(
    amount * 100
  );
}

function splitCustomerName(value) {
  const parts = String(value || "")
    .trim()
    .split(/\s+/)
    .filter(Boolean);

  const firstName =
    parts.shift() || "Customer";

  const lastName =
    parts.join(" ") || firstName;

  return {
    firstName,
    lastName
  };
}

function normalizePhone(value) {
  const phone = String(
    value || ""
  )
    .trim()
    .replace(/[^\d+]/g, "");

  return phone || "NA";
}

function buildBillingData(order) {
  const {
    firstName,
    lastName
  } = splitCustomerName(
    order.customer?.fullName
  );

  const shipping =
    order.shippingAddress || {};

  return {
    apartment:
      shipping.apartment ||
      "NA",

    email:
      order.customer?.email ||
      "customer@example.com",

    floor:
      shipping.floor ||
      "NA",

    first_name:
      firstName,

    street:
      shipping.addressLine ||
      "NA",

    building:
      shipping.building ||
      "NA",

    phone_number:
      normalizePhone(
        order.customer?.phone
      ),

    shipping_method:
      "PKG",

    postal_code:
      "NA",

    city:
      shipping.city ||
      "NA",

    country:
      "EG",

    last_name:
      lastName,

    state:
      shipping.governorate ||
      "NA"
  };
}

async function readPaymobResponse(
  response,
  operation
) {
  const raw =
    await response.text();

  let payload = {};

  if (raw) {
    try {
      payload =
        JSON.parse(raw);
    } catch {
      payload = {
        message: raw
      };
    }
  }

  if (!response.ok) {
    console.error(
      `[paymob] ${operation} failed`,
      {
        status: response.status,
        payload
      }
    );

    throw createHttpError(
      502,
      `Paymob could not ${operation.toLowerCase()}`
    );
  }

  return payload;
}

async function paymobPost(
  path,
  body,
  operation
) {
  const config =
    getPaymobConfig();

  const controller =
    new AbortController();

  const timeout =
    setTimeout(
      () => controller.abort(),
      config.requestTimeout
    );

  try {
    const response =
      await fetch(
        `${config.baseUrl}${path}`,
        {
          method: "POST",

          headers: {
            "Content-Type":
              "application/json",

            Accept:
              "application/json"
          },

          body:
            JSON.stringify(body),

          signal:
            controller.signal
        }
      );

    return await readPaymobResponse(
      response,
      operation
    );
  } catch (error) {
    if (
      error?.name ===
      "AbortError"
    ) {
      throw createHttpError(
        504,
        `Paymob timed out while trying to ${operation.toLowerCase()}`
      );
    }

    if (error?.statusCode) {
      throw error;
    }

    console.error(
      `[paymob] ${operation} network error`,
      error
    );

    throw createHttpError(
      502,
      `Could not connect to Paymob while trying to ${operation.toLowerCase()}`
    );
  } finally {
    clearTimeout(timeout);
  }
}

async function getAuthenticationToken() {
  const config =
    getPaymobConfig();

  const response =
    await paymobPost(
      "/api/auth/tokens",
      {
        api_key:
          config.apiKey
      },
      "authenticate"
    );

  if (!response.token) {
    throw createHttpError(
      502,
      "Paymob did not return an authentication token"
    );
  }

  return response.token;
}

async function createPaymobOrder({
  authenticationToken,
  order,
  amountCents
}) {
  const config =
    getPaymobConfig();

  const response =
    await paymobPost(
      "/api/ecommerce/orders",
      {
        auth_token:
          authenticationToken,

        delivery_needed:
          false,

        amount_cents:
          amountCents,

        currency:
          config.currency,

        merchant_order_id:
          order.orderNumber,

        items: [
          {
            name:
              `Tap & Wrap ${order.orderNumber}`,

            amount_cents:
              amountCents,

            description:
              "Tap & Wrap gift order",

            quantity: 1
          }
        ]
      },
      "create the payment order"
    );

  if (!response.id) {
    throw createHttpError(
      502,
      "Paymob did not return a payment order ID"
    );
  }

  return String(
    response.id
  );
}

async function createPaymentKey({
  authenticationToken,
  order,
  paymobOrderId,
  amountCents
}) {
  const config =
    getPaymobConfig();

  const response =
    await paymobPost(
      "/api/acceptance/payment_keys",
      {
        auth_token:
          authenticationToken,

        amount_cents:
          amountCents,

        expiration:
          config.paymentKeyExpiration,

        order_id:
          paymobOrderId,

        billing_data:
          buildBillingData(
            order
          ),

        currency:
          config.currency,

        integration_id:
          Number(
            config.integrationId
          )
      },
      "create the card payment key"
    );

  if (!response.token) {
    throw createHttpError(
      502,
      "Paymob did not return a card payment token"
    );
  }

  return response.token;
}

export async function createPaymobCheckoutSession(
  order
) {
  if (!isPaymobConfigured()) {
    throw createHttpError(
      503,
      "Card payment is not configured yet"
    );
  }

  const config =
    getPaymobConfig();

  const amountCents =
    toAmountCents(
      order.totals
        ?.grandTotal
    );

  const authenticationToken =
    await getAuthenticationToken();

  let paymobOrderId =
    String(
      order.payment
        ?.paymob?.orderId ||
        ""
    ).trim();

  if (!paymobOrderId) {
    paymobOrderId =
      await createPaymobOrder({
        authenticationToken,
        order,
        amountCents
      });
  }

  const paymentToken =
    await createPaymentKey({
      authenticationToken,
      order,
      paymobOrderId,
      amountCents
    });

  const createdAt =
    new Date();

  const expiresAt =
    new Date(
      createdAt.getTime() +
        config.paymentKeyExpiration *
          1000
    );

  return {
    paymobOrderId,
    amountCents,
    createdAt,
    expiresAt,

    redirectUrl:
      `${config.baseUrl}/api/acceptance/iframes/${encodeURIComponent(
        config.iframeId
      )}?payment_token=${encodeURIComponent(
        paymentToken
      )}`
  };
}

function getNestedValue(
  object,
  path
) {
  if (
    Object.prototype.hasOwnProperty.call(
      object || {},
      path
    )
  ) {
    return object[path];
  }

  return path
    .split(".")
    .reduce(
      (
        current,
        segment
      ) =>
        current ===
          null ||
        current ===
          undefined
          ? undefined
          : current[segment],
      object
    );
}

function canonicalValue(
  value
) {
  if (
    value === null ||
    value === undefined
  ) {
    return "";
  }

  if (
    typeof value ===
    "boolean"
  ) {
    return value
      ? "true"
      : "false";
  }

  return String(value);
}

function getHmacFieldValue(
  payload,
  field
) {
  if (field === "order") {
    const orderValue =
      getNestedValue(
        payload,
        "order"
      );

    if (
      orderValue &&
      typeof orderValue ===
        "object"
    ) {
      return orderValue.id;
    }

    return orderValue;
  }

  return getNestedValue(
    payload,
    field
  );
}

export function calculatePaymobHmac(
  payload
) {
  const config =
    getPaymobConfig();

  const concatenated =
    PAYMOB_HMAC_FIELDS.map(
      (field) =>
        canonicalValue(
          getHmacFieldValue(
            payload,
            field
          )
        )
    ).join("");

  return crypto
    .createHmac(
      "sha512",
      config.hmacSecret
    )
    .update(concatenated)
    .digest("hex");
}

function safeHexEqual(
  first,
  second
) {
  const firstBuffer =
    Buffer.from(
      String(first || "")
        .trim()
        .toLowerCase(),
      "utf8"
    );

  const secondBuffer =
    Buffer.from(
      String(second || "")
        .trim()
        .toLowerCase(),
      "utf8"
    );

  if (
    firstBuffer.length !==
    secondBuffer.length
  ) {
    return false;
  }

  return crypto.timingSafeEqual(
    firstBuffer,
    secondBuffer
  );
}

export function verifyPaymobHmac({
  payload,
  receivedHmac
}) {
  if (
    !receivedHmac ||
    !isPaymobConfigured()
  ) {
    return false;
  }

  const expectedHmac =
    calculatePaymobHmac(
      payload
    );

  return safeHexEqual(
    expectedHmac,
    receivedHmac
  );
}

function parseBoolean(value) {
  if (
    typeof value ===
    "boolean"
  ) {
    return value;
  }

  return [
    "true",
    "1",
    "yes"
  ].includes(
    String(value || "")
      .trim()
      .toLowerCase()
  );
}

export function normalizePaymobTransaction(
  payload
) {
  const orderValue =
    getNestedValue(
      payload,
      "order"
    );

  const nestedOrder =
    orderValue &&
    typeof orderValue ===
      "object"
      ? orderValue
      : null;

  return {
    transactionId:
      String(
        getNestedValue(
          payload,
          "id"
        ) || ""
      ),

    paymobOrderId:
      String(
        nestedOrder?.id ||
          orderValue ||
          ""
      ),

    merchantOrderId:
      String(
        nestedOrder
          ?.merchant_order_id ||
          getNestedValue(
            payload,
            "merchant_order_id"
          ) ||
          ""
      ),

    amountCents:
      Number(
        getNestedValue(
          payload,
          "amount_cents"
        ) || 0
      ),

    currency:
      String(
        getNestedValue(
          payload,
          "currency"
        ) || ""
      ).toUpperCase(),

    integrationId:
      String(
        getNestedValue(
          payload,
          "integration_id"
        ) || ""
      ),

    success:
      parseBoolean(
        getNestedValue(
          payload,
          "success"
        )
      ),

    pending:
      parseBoolean(
        getNestedValue(
          payload,
          "pending"
        )
      ),

    errorOccurred:
      parseBoolean(
        getNestedValue(
          payload,
          "error_occured"
        )
      ),

    isRefunded:
      parseBoolean(
        getNestedValue(
          payload,
          "is_refunded"
        )
      ),

    isVoided:
      parseBoolean(
        getNestedValue(
          payload,
          "is_voided"
        )
      ),

    sourceType:
      String(
        getNestedValue(
          payload,
          "source_data.type"
        ) || ""
      ),

    sourceSubType:
      String(
        getNestedValue(
          payload,
          "source_data.sub_type"
        ) || ""
      ),

    maskedPan:
      String(
        getNestedValue(
          payload,
          "source_data.pan"
        ) || ""
      ),

    createdAt:
      getNestedValue(
        payload,
        "created_at"
      ) || null
  };
}

function getResultSignatureValue({
  orderNumber,
  transactionId,
  status
}) {
  return [
    String(orderNumber || ""),
    String(transactionId || ""),
    String(status || "")
  ].join("|");
}

export function createPaymentResultSignature(
  values
) {
  const config =
    getPaymobConfig();

  return crypto
    .createHmac(
      "sha256",
      config.resultSecret
    )
    .update(
      getResultSignatureValue(
        values
      )
    )
    .digest("hex");
}

export function verifyPaymentResultSignature({
  orderNumber,
  transactionId,
  status,
  signature
}) {
  const expected =
    createPaymentResultSignature({
      orderNumber,
      transactionId,
      status
    });

  return safeHexEqual(
    expected,
    signature
  );
}

export function getExpectedAmountCents(
  order
) {
  return toAmountCents(
    order.totals
      ?.grandTotal
  );
}
