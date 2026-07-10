import express from "express";
import rateLimit from "express-rate-limit";

import {
  uploadAdminProductImage
} from "../controllers/adminUpload.controller.js";

import {
  protectAdmin
} from "../middleware/adminAuth.middleware.js";

import {
  uploadSingleImage
} from "../middleware/upload.middleware.js";

const router = express.Router();

const adminUploadLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  limit: 150,
  standardHeaders: true,
  legacyHeaders: false,

  message: {
    success: false,
    message:
      "Too many product image uploads. Please wait before trying again."
  }
});

router.use(protectAdmin);

router.post(
  "/product-image",
  adminUploadLimiter,
  uploadSingleImage,
  uploadAdminProductImage
);

export default router;