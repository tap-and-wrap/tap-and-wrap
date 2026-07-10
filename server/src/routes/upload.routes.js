import express from "express";
import rateLimit from "express-rate-limit";

import {
  uploadCustomerImage
} from "../controllers/upload.controller.js";

import {
  uploadSingleCustomerImage
} from "../middleware/upload.middleware.js";

const router = express.Router();

const customerUploadLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  limit: 30,
  standardHeaders: true,
  legacyHeaders: false,

  message: {
    success: false,
    message:
      "Too many image uploads. Please wait before trying again."
  }
});

router.post(
  "/customer-image",
  customerUploadLimiter,
  uploadSingleCustomerImage,
  uploadCustomerImage
);

export default router;