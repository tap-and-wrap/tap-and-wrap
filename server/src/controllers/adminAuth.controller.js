import Admin from "../models/Admin.js";

import { asyncHandler } from "../utils/asyncHandler.js";
import { createHttpError } from "../utils/httpError.js";
import {
  ADMIN_COOKIE_NAME,
  getAdminCookieClearOptions,
  getAdminCookieOptions,
  signAdminToken
} from "../utils/authToken.js";

import {
  adminLoginSchema
} from "../validators/adminAuth.validator.js";

export const loginAdmin = asyncHandler(async (req, res) => {
  const validation = adminLoginSchema.safeParse(req.body);

  if (!validation.success) {
    throw createHttpError(
      400,
      "Invalid login information",
      validation.error.flatten()
    );
  }

  const { email, password } = validation.data;

  const admin = await Admin.findOne({
    email
  }).select("+password");

  if (!admin || !admin.isActive) {
    throw createHttpError(
      401,
      "Invalid email or password"
    );
  }

  const passwordMatches = await admin.comparePassword(password);

  if (!passwordMatches) {
    throw createHttpError(
      401,
      "Invalid email or password"
    );
  }

  const token = signAdminToken(admin._id);

  res.cookie(
    ADMIN_COOKIE_NAME,
    token,
    getAdminCookieOptions()
  );

  admin.lastLoginAt = new Date();

  await admin.save({
    validateBeforeSave: false
  });

  res.status(200).json({
    success: true,
    message: "Admin login successful",
    admin: admin.toSafeObject()
  });
});

export const logoutAdmin = asyncHandler(async (req, res) => {
  res.clearCookie(
    ADMIN_COOKIE_NAME,
    getAdminCookieClearOptions()
  );

  res.status(200).json({
    success: true,
    message: "Admin logout successful"
  });
});

export const getCurrentAdmin = asyncHandler(async (req, res) => {
  res.status(200).json({
    success: true,
    admin: req.admin.toSafeObject()
  });
});