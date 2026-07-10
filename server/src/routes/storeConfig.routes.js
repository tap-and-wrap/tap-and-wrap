import express from "express";

import { getStoreConfig } from "../controllers/storeConfig.controller.js";

const router = express.Router();

router.get("/", getStoreConfig);

export default router;