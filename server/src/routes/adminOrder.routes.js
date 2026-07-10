import express from "express";

import {
  getAdminDashboard,
  getAdminOrderById,
  listAdminOrders,
  updateAdminOrderStatus,
  updateAdminPaymentStatus
} from "../controllers/adminOrder.controller.js";

import {
  protectAdmin
} from "../middleware/adminAuth.middleware.js";

const router = express.Router();

router.use(protectAdmin);

router.get("/dashboard", getAdminDashboard);
router.get("/", listAdminOrders);
router.get("/:id", getAdminOrderById);

router.patch(
  "/:id/status",
  updateAdminOrderStatus
);

router.patch(
  "/:id/payment",
  updateAdminPaymentStatus
);

export default router;