import express from "express";

import {
  getAdminAnalytics
} from "../controllers/adminAnalytics.controller.js";

import {
  protectAdmin
} from "../middleware/adminAuth.middleware.js";

const router = express.Router();

router.use(protectAdmin);

router.get(
  "/overview",
  getAdminAnalytics
);

export default router;