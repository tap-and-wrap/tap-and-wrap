import express from "express";
import rateLimit from "express-rate-limit";

import {
  trackOrder
} from "../controllers/orderTracking.controller.js";

const router = express.Router();

const trackingLimiter =
  rateLimit({
    windowMs:
      15 * 60 * 1000,

    limit: 30,

    standardHeaders: true,
    legacyHeaders: false,

    message: {
      success: false,

      message:
        "Too many tracking attempts. Please wait before trying again."
    }
  });

router.post(
  "/",
  trackingLimiter,
  trackOrder
);

export default router;