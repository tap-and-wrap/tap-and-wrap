import Admin from "../models/Admin.js";

import { asyncHandler } from "../utils/asyncHandler.js";
import { createHttpError } from "../utils/httpError.js";
import {
  ADMIN_COOKIE_NAME,
  verifyAdminToken
} from "../utils/authToken.js";

export const protectAdmin = asyncHandler(async (req, res, next) => {
  const token = req.cookies?.[ADMIN_COOKIE_NAME];

  if (!token) {
    throw createHttpError(
      401,
      "Admin authentication is required"
    );
  }

  let decodedToken;

  try {
    decodedToken = verifyAdminToken(token);
  } catch {
    throw createHttpError(
      401,
      "Your admin session is invalid or has expired"
    );
  }

  if (
    decodedToken.type !== "admin" ||
    !decodedToken.sub
  ) {
    throw createHttpError(
      401,
      "Invalid admin session"
    );
  }

  const admin = await Admin.findOne({
    _id: decodedToken.sub,
    isActive: true
  });

  if (!admin) {
    throw createHttpError(
      401,
      "The administrator account is unavailable"
    );
  }

  req.admin = admin;

  return next();
});

export function requireOwner(req, res, next) {
  if (req.admin?.role !== "owner") {
    return next(
      createHttpError(
        403,
        "Owner permission is required"
      )
    );
  }

  return next();
}