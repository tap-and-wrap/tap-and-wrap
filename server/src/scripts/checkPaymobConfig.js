import "dotenv/config";

import {
  getPaymobCallbackUrls,
  getPaymobConfig,
  isPaymobConfigured
} from "../config/paymob.js";

const config =
  getPaymobConfig();

const callbackUrls =
  getPaymobCallbackUrls();

const checks = {
  PAYMOB_API_KEY:
    Boolean(config.apiKey),

  PAYMOB_INTEGRATION_ID_CARD:
    Boolean(
      config.integrationId
    ),

  PAYMOB_IFRAME_ID:
    Boolean(
      config.iframeId
    ),

  PAYMOB_HMAC_SECRET:
    Boolean(
      config.hmacSecret
    ),

  RESULT_SIGNING_SECRET:
    Boolean(
      config.resultSecret
    )
};

console.log(
  "Paymob readiness:"
);

for (
  const [
    name,
    ready
  ] of Object.entries(
    checks
  )
) {
  console.log(
    `${ready ? "✓" : "✗"} ${name}`
  );
}

console.log(
  "\nProcessed callback:"
);

console.log(
  callbackUrls
    .processedCallback
);

console.log(
  "\nResponse callback:"
);

console.log(
  callbackUrls
    .responseCallback
);

console.log(
  `\nOverall: ${
    isPaymobConfigured()
      ? "READY"
      : "NOT CONFIGURED"
  }`
);
