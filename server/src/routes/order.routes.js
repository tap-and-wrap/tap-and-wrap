import express from "express";
import rateLimit from "express-rate-limit";

import { createOrder } from "../controllers/order.controller.js";

const router = express.Router();

const orderCreationLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    success: false,
    message:
      "Too many order attempts. Please wait before trying again."
  }
});

router.post("/", orderCreationLimiter, createOrder);

export default router;