import express from "express";

import {
  getAdminServiceRequest,
  listAdminServiceRequests,
  updateAdminServiceRequest
} from "../controllers/adminServiceRequest.controller.js";

import {
  protectAdmin
} from "../middleware/adminAuth.middleware.js";

const router =
  express.Router();

router.use(protectAdmin);

router.get(
  "/",
  listAdminServiceRequests
);

router.get(
  "/:id",
  getAdminServiceRequest
);

router.patch(
  "/:id",
  updateAdminServiceRequest
);

export default router;