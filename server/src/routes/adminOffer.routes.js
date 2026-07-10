import express from "express";

import {
  createAdminOffer,
  deleteAdminOffer,
  listAdminOffers,
  updateAdminOffer
} from "../controllers/adminOffer.controller.js";

import {
  protectAdmin
} from "../middleware/adminAuth.middleware.js";

const router = express.Router();

router.use(protectAdmin);

router.get(
  "/",
  listAdminOffers
);

router.post(
  "/",
  createAdminOffer
);

router.patch(
  "/:id",
  updateAdminOffer
);

router.delete(
  "/:id",
  deleteAdminOffer
);

export default router;