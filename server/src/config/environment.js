const VALID_NODE_ENVIRONMENTS =
  new Set([
    "development",
    "test",
    "production"
  ]);

function read(name) {
  return String(
    process.env[name] || ""
  ).trim();
}

function splitCsv(value) {
  return String(value || "")
    .split(",")
    .map((item) =>
      item.trim()
    )
    .filter(Boolean);
}

function isHttpUrl(value) {
  try {
    const parsed =
      new URL(value);

    return [
      "http:",
      "https:"
    ].includes(
      parsed.protocol
    );
  } catch {
    return false;
  }
}

function addMissing(
  errors,
  names
) {
  for (
    const name of names
  ) {
    if (!read(name)) {
      errors.push(
        `${name} is required`
      );
    }
  }
}

function validateConditionalGroup({
  errors,
  names,
  enabled
}) {
  if (!enabled) {
    return;
  }

  addMissing(
    errors,
    names
  );
}

export function getAllowedOrigins() {
  const configuredOrigins = [
    read("CLIENT_URL"),
    ...splitCsv(
      process.env.CLIENT_URLS
    )
  ].filter(Boolean);

  const developmentOrigins =
    process.env.NODE_ENV ===
      "production"
      ? []
      : [
          "http://localhost:5173",
          "http://127.0.0.1:5173"
        ];

  return [
    ...new Set([
      ...configuredOrigins,
      ...developmentOrigins
    ])
  ].map((origin) =>
    origin.replace(/\/+$/, "")
  );
}

export function validateEnvironment() {
  const errors = [];
  const warnings = [];

  const nodeEnvironment =
    read("NODE_ENV") ||
    "development";

  if (
    !VALID_NODE_ENVIRONMENTS.has(
      nodeEnvironment
    )
  ) {
    errors.push(
      "NODE_ENV must be development, test, or production"
    );
  }

  addMissing(
    errors,
    [
      "MONGO_URI",
      "JWT_SECRET"
    ]
  );

  if (
    read("JWT_SECRET").length > 0 &&
    read("JWT_SECRET").length < 32
  ) {
    errors.push(
      "JWT_SECRET must contain at least 32 characters"
    );
  }

  if (
    nodeEnvironment ===
      "production"
  ) {
    addMissing(
      errors,
      [
        "CLIENT_URL",
        "SERVER_URL"
      ]
    );
  }

  for (
    const [
      name,
      value
    ] of [
      [
        "CLIENT_URL",
        read("CLIENT_URL")
      ],
      [
        "SERVER_URL",
        read("SERVER_URL")
      ]
    ]
  ) {
    if (
      value &&
      !isHttpUrl(value)
    ) {
      errors.push(
        `${name} must be a valid HTTP or HTTPS URL`
      );
    }
  }

  for (
    const origin of
      getAllowedOrigins()
  ) {
    if (!isHttpUrl(origin)) {
      errors.push(
        `Invalid allowed origin: ${origin}`
      );
    }
  }

  const cloudinaryValues = [
    read(
      "CLOUDINARY_CLOUD_NAME"
    ),
    read(
      "CLOUDINARY_API_KEY"
    ),
    read(
      "CLOUDINARY_API_SECRET"
    )
  ];

  validateConditionalGroup({
    errors,

    enabled:
      cloudinaryValues.some(
        Boolean
      ),

    names: [
      "CLOUDINARY_CLOUD_NAME",
      "CLOUDINARY_API_KEY",
      "CLOUDINARY_API_SECRET"
    ]
  });

  const paymobValues = [
    read(
      "PAYMOB_API_KEY"
    ),
    read(
      "PAYMOB_INTEGRATION_ID_CARD"
    ),
    read(
      "PAYMOB_IFRAME_ID"
    ),
    read(
      "PAYMOB_HMAC_SECRET"
    )
  ];

  validateConditionalGroup({
    errors,

    enabled:
      paymobValues.some(
        Boolean
      ),

    names: [
      "PAYMOB_API_KEY",
      "PAYMOB_INTEGRATION_ID_CARD",
      "PAYMOB_IFRAME_ID",
      "PAYMOB_HMAC_SECRET"
    ]
  });

  const emailPassword =
    read(
      "EMAIL_APP_PASSWORD"
    ) ||
    read(
      "EMAIL_PASS"
    );

  const emailValues = [
    read("EMAIL_HOST"),
    read("EMAIL_USER"),
    emailPassword,
    read(
      "EMAIL_FROM_ADDRESS"
    )
  ];

  if (
    emailValues.some(Boolean) &&
    !emailValues.every(Boolean)
  ) {
    warnings.push(
      "Email is only partially configured. Notifications will remain unavailable until EMAIL_HOST, EMAIL_USER, EMAIL_APP_PASSWORD (or EMAIL_PASS), and EMAIL_FROM_ADDRESS are all set."
    );
  }

  if (
    nodeEnvironment ===
      "production" &&
    getAllowedOrigins().length === 0
  ) {
    errors.push(
      "At least one production client origin is required"
    );
  }

  if (errors.length) {
    const message = [
      "Invalid environment configuration:",
      ...errors.map(
        (error) =>
          `- ${error}`
      )
    ].join("\n");

    throw new Error(
      message
    );
  }

  for (
    const warning of
      warnings
  ) {
    console.warn(
      `[environment] ${warning}`
    );
  }

  return {
    nodeEnvironment,
    allowedOrigins:
      getAllowedOrigins()
  };
}
