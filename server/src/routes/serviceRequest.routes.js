import express from "express";
import rateLimit from "express-rate-limit";

import {
  createServiceRequest
} from "../controllers/serviceRequest.controller.js";

const router = express.Router();

const serviceRequestLimiter =
  rateLimit({
    windowMs:
      60 * 60 * 1000,

    limit: 10,

    standardHeaders: true,
    legacyHeaders: false,

    message: {
      success: false,

      message:
        "Too many service requests were submitted. Please wait before trying again."
    }
  });

router.post(
  "/",
  serviceRequestLimiter,
  createServiceRequest
);

export default router;