function clean(value) {
  return String(value || "").trim();
}

function cleanBaseUrl(value, fallback) {
  return clean(value || fallback).replace(/\/+$/, "");
}

function parsePositiveInteger(value, fallback) {
  const parsed = Number.parseInt(value, 10);

  return Number.isFinite(parsed) && parsed > 0
    ? parsed
    : fallback;
}

export function getPaymobConfig() {
  const apiKey = clean(
    process.env.PAYMOB_API_KEY
  );

  const integrationId = clean(
    process.env.PAYMOB_INTEGRATION_ID_CARD
  );

  const iframeId = clean(
    process.env.PAYMOB_IFRAME_ID
  );

  const hmacSecret = clean(
    process.env.PAYMOB_HMAC_SECRET
  );

  const resultSecret = clean(
    process.env.PAYMOB_RESULT_SECRET ||
      process.env.JWT_SECRET ||
      hmacSecret
  );

  const baseUrl = cleanBaseUrl(
    process.env.PAYMOB_BASE_URL,
    "https://accept.paymob.com"
  );

  const clientUrl = cleanBaseUrl(
    process.env.CLIENT_URL,
    "http://localhost:5173"
  );

  const serverUrl = cleanBaseUrl(
    process.env.SERVER_URL,
    "http://localhost:5000"
  );

  return {
    apiKey,
    integrationId,
    iframeId,
    hmacSecret,
    resultSecret,
    baseUrl,
    clientUrl,
    serverUrl,
    currency: "EGP",

    paymentKeyExpiration:
      parsePositiveInteger(
        process.env
          .PAYMOB_PAYMENT_KEY_EXPIRATION,
        3600
      ),

    requestTimeout:
      parsePositiveInteger(
        process.env
          .PAYMOB_REQUEST_TIMEOUT_MS,
        25000
      )
  };
}

export function isPaymobConfigured() {
  const config =
    getPaymobConfig();

  return Boolean(
    config.apiKey &&
      config.integrationId &&
      config.iframeId &&
      config.hmacSecret &&
      config.resultSecret
  );
}

export function getPaymobCallbackUrls() {
  const config =
    getPaymobConfig();

  return {
    processedCallback:
      `${config.serverUrl}/api/payments/paymob/webhook`,

    responseCallback:
      `${config.serverUrl}/api/payments/paymob/response`
  };
}
