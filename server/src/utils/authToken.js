import jwt from "jsonwebtoken";

export const ADMIN_COOKIE_NAME =
  String(
    process.env.ADMIN_COOKIE_NAME ||
      "tap_wrap_admin"
  ).trim();

function getJwtSecret() {
  const secret =
    String(
      process.env.JWT_SECRET ||
        ""
    ).trim();

  if (!secret) {
    throw new Error(
      "JWT_SECRET is required"
    );
  }

  return secret;
}

function getSameSite() {
  const configured =
    String(
      process.env
        .ADMIN_COOKIE_SAME_SITE ||
        ""
    )
      .trim()
      .toLowerCase();

  if (
    [
      "lax",
      "strict",
      "none"
    ].includes(
      configured
    )
  ) {
    return configured;
  }

  return process.env
    .NODE_ENV ===
    "production"
    ? "none"
    : "lax";
}

function getCookieMaxAge() {
  const days =
    Number.parseInt(
      process.env
        .ADMIN_COOKIE_DAYS,
      10
    );

  const safeDays =
    Number.isFinite(days) &&
    days > 0
      ? days
      : 7;

  return (
    safeDays *
    24 *
    60 *
    60 *
    1000
  );
}

function getBaseCookieOptions() {
  const sameSite =
    getSameSite();

  const production =
    process.env.NODE_ENV ===
    "production";

  const secure =
    production ||
    sameSite === "none";

  const domain =
    String(
      process.env
        .ADMIN_COOKIE_DOMAIN ||
        ""
    ).trim();

  return {
    httpOnly: true,
    secure,
    sameSite,
    path: "/",

    ...(domain
      ? {
          domain
        }
      : {})
  };
}

export function getAdminCookieOptions() {
  return {
    ...getBaseCookieOptions(),

    maxAge:
      getCookieMaxAge()
  };
}

export function getAdminCookieClearOptions() {
  return getBaseCookieOptions();
}

export function signAdminToken(
  adminId
) {
  return jwt.sign(
    {
      type: "admin"
    },

    getJwtSecret(),

    {
      subject:
        String(adminId),

      expiresIn:
        process.env
          .ADMIN_TOKEN_EXPIRES_IN ||
        "7d",

      issuer:
        "tap-and-wrap",

      audience:
        "tap-and-wrap-admin"
    }
  );
}

export function verifyAdminToken(
  token
) {
  return jwt.verify(
    token,
    getJwtSecret(),
    {
      issuer:
        "tap-and-wrap",

      audience:
        "tap-and-wrap-admin"
    }
  );
}
