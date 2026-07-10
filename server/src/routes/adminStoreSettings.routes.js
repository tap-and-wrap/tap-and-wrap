import express from "express";

import {
  getAdminStoreSettings,
  updateAdminStoreSettings
} from "../controllers/adminStoreSettings.controller.js";

import {
  protectAdmin
} from "../middleware/adminAuth.middleware.js";

const router =
  express.Router();

router.use(protectAdmin);

router.get(
  "/",
  getAdminStoreSettings
);

router.patch(
  "/",
  updateAdminStoreSettings
);

export default router;
