import express from "express";
import rateLimit from "express-rate-limit";

import { previewOrderPricing } from "../controllers/pricing.controller.js";

const router = express.Router();

const pricingPreviewLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 120,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    success: false,
    message: "Too many pricing requests. Please wait before trying again."
  }
});

router.post(
  "/preview",
  pricingPreviewLimiter,
  previewOrderPricing
);

export default router;
