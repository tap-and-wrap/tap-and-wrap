import express from "express";
import rateLimit from "express-rate-limit";

import {
  getCurrentAdmin,
  loginAdmin,
  logoutAdmin
} from "../controllers/adminAuth.controller.js";

import {
  protectAdmin
} from "../middleware/adminAuth.middleware.js";

const router = express.Router();

const adminLoginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 5,
  standardHeaders: true,
  legacyHeaders: false,
  skipSuccessfulRequests: true,

  message: {
    success: false,
    message:
      "Too many admin login attempts. Please wait before trying again."
  }
});

router.post(
  "/login",
  adminLoginLimiter,
  loginAdmin
);

router.post(
  "/logout",
  protectAdmin,
  logoutAdmin
);

router.get(
  "/me",
  protectAdmin,
  getCurrentAdmin
);

export default router;