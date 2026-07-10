import express from "express";

import {
  createAdminCategory,
  deleteAdminCategory,
  listAdminCategories,
  updateAdminCategory
} from "../controllers/adminCategory.controller.js";

import {
  protectAdmin
} from "../middleware/adminAuth.middleware.js";

const router = express.Router();

router.use(protectAdmin);

router.get("/", listAdminCategories);
router.post("/", createAdminCategory);

router.patch(
  "/:id",
  updateAdminCategory
);

router.delete(
  "/:id",
  deleteAdminCategory
);

export default router;