import express from "express";
import rateLimit from "express-rate-limit";

import {
  getPaymobPaymentResult,
  handlePaymobResponse,
  handlePaymobWebhook,
  retryPaymobCardPayment
} from "../controllers/paymob.controller.js";

const router =
  express.Router();

const customerPaymentLimiter =
  rateLimit({
    windowMs:
      15 * 60 * 1000,

    limit: 20,

    standardHeaders: true,
    legacyHeaders: false,

    message: {
      success: false,

      message:
        "Too many payment requests. Please wait before trying again."
    }
  });

router.post(
  "/webhook",
  handlePaymobWebhook
);

router.get(
  "/response",
  handlePaymobResponse
);

router.post(
  "/retry",
  customerPaymentLimiter,
  retryPaymobCardPayment
);

router.get(
  "/result",
  customerPaymentLimiter,
  getPaymobPaymentResult
);

export default router;
