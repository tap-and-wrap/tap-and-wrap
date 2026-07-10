import express from "express";
import rateLimit from "express-rate-limit";

import {
  validateDiscountCode
} from "../controllers/discount.controller.js";

const router = express.Router();

const discountValidationLimiter =
  rateLimit({
    windowMs:
      15 * 60 * 1000,

    limit: 60,

    standardHeaders: true,
    legacyHeaders: false,

    message: {
      success: false,

      message:
        "Too many discount attempts. Please wait before trying again."
    }
  });

router.post(
  "/validate",
  discountValidationLimiter,
  validateDiscountCode
);

export default router;