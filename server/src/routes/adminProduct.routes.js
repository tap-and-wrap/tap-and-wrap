import express from "express";

import {
  createAdminProduct,
  deleteAdminProduct,
  getAdminProductById,
  listAdminProducts,
  updateAdminProduct
} from "../controllers/adminProduct.controller.js";

import {
  protectAdmin
} from "../middleware/adminAuth.middleware.js";

const router = express.Router();

router.use(protectAdmin);

router.get("/", listAdminProducts);
router.post("/", createAdminProduct);

router.get(
  "/:id",
  getAdminProductById
);

router.patch(
  "/:id",
  updateAdminProduct
);

router.delete(
  "/:id",
  deleteAdminProduct
);

export default router;