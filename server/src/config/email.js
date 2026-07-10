import nodemailer from "nodemailer";

let cachedTransporter = null;
let cachedSignature = "";

function parseBoolean(
  value,
  fallback = false
) {
  if (
    value === undefined ||
    value === null ||
    value === ""
  ) {
    return fallback;
  }

  return [
    "true",
    "1",
    "yes",
    "on"
  ].includes(
    String(value)
      .trim()
      .toLowerCase()
  );
}

function getEmailPort() {
  const port = Number.parseInt(
    process.env.EMAIL_PORT,
    10
  );

  return Number.isFinite(port)
    ? port
    : 465;
}

export function getEmailSettings() {
  const host = String(
    process.env.EMAIL_HOST ||
      "smtp.gmail.com"
  ).trim();

  const port = getEmailPort();

  const secure = parseBoolean(
    process.env.EMAIL_SECURE,
    port === 465
  );

  const user = String(
    process.env.EMAIL_USER || ""
  ).trim();

  /*
   * Supports the variable name already
   * used in your project, while keeping
   * EMAIL_PASS as a fallback.
   */
  const password = String(
    process.env
      .EMAIL_APP_PASSWORD ||
      process.env.EMAIL_PASS ||
      ""
  )
    .replace(/\s+/g, "")
    .trim();

  const fromName = String(
    process.env.EMAIL_FROM_NAME ||
      "Tap & Wrap"
  ).trim();

  const fromAddress = String(
    process.env
      .EMAIL_FROM_ADDRESS ||
      user
  ).trim();

  const replyTo = String(
    process.env.EMAIL_REPLY_TO ||
      fromAddress
  ).trim();

  const adminEmail = String(
    process.env
      .ADMIN_NOTIFICATION_EMAIL ||
      process.env.ADMIN_EMAIL ||
      ""
  ).trim();

  const clientUrl = String(
    process.env.CLIENT_URL ||
      "http://localhost:5173"
  )
    .trim()
    .replace(/\/+$/, "");

  return {
    host,
    port,
    secure,
    user,
    password,
    fromName,
    fromAddress,
    replyTo,
    adminEmail,
    clientUrl
  };
}

export function isEmailConfigured() {
  const settings =
    getEmailSettings();

  return Boolean(
    settings.host &&
      settings.user &&
      settings.password &&
      settings.fromAddress
  );
}

export function getEmailTransporter() {
  const settings =
    getEmailSettings();

  if (!isEmailConfigured()) {
    return null;
  }

  const signature =
    JSON.stringify({
      host: settings.host,
      port: settings.port,
      secure: settings.secure,
      user: settings.user
    });

  if (
    cachedTransporter &&
    cachedSignature === signature
  ) {
    return cachedTransporter;
  }

  cachedTransporter =
    nodemailer.createTransport({
      host: settings.host,
      port: settings.port,
      secure: settings.secure,

      auth: {
        user: settings.user,
        pass: settings.password
      },

      pool: true,
      maxConnections: 3,
      maxMessages: 100,

      connectionTimeout:
        30000,

      greetingTimeout:
        30000,

      socketTimeout:
        60000
    });

  cachedSignature =
    signature;

  return cachedTransporter;
}

export function resetEmailTransporter() {
  if (
    cachedTransporter &&
    typeof cachedTransporter.close ===
      "function"
  ) {
    cachedTransporter.close();
  }

  cachedTransporter = null;
  cachedSignature = "";
}