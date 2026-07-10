import express from "express";

import {
  createAdminDiscount,
  deleteAdminDiscount,
  listAdminDiscounts,
  updateAdminDiscount
} from "../controllers/adminDiscount.controller.js";

import {
  protectAdmin
} from "../middleware/adminAuth.middleware.js";

const router = express.Router();

router.use(protectAdmin);

router.get(
  "/",
  listAdminDiscounts
);

router.post(
  "/",
  createAdminDiscount
);

router.patch(
  "/:id",
  updateAdminDiscount
);

router.delete(
  "/:id",
  deleteAdminDiscount
);

export default router;