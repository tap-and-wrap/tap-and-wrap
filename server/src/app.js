import express from "express";
import cors from "cors";
import helmet from "helmet";
import morgan from "morgan";
import cookieParser from "cookie-parser";
import rateLimit from "express-rate-limit";

import healthRoutes from "./routes/health.routes.js";
import categoryRoutes from "./routes/category.routes.js";
import productRoutes from "./routes/product.routes.js";
import storeConfigRoutes from "./routes/storeConfig.routes.js";
import orderRoutes from "./routes/order.routes.js";
import uploadRoutes from "./routes/upload.routes.js";
import discountRoutes from "./routes/discount.routes.js";
import pricingRoutes from "./routes/pricing.routes.js";
import serviceRequestRoutes from "./routes/serviceRequest.routes.js";
import orderTrackingRoutes from "./routes/orderTracking.routes.js";
import paymobRoutes from "./routes/paymob.routes.js";

import adminAuthRoutes from "./routes/adminAuth.routes.js";
import adminOrderRoutes from "./routes/adminOrder.routes.js";
import adminCategoryRoutes from "./routes/adminCategory.routes.js";
import adminProductRoutes from "./routes/adminProduct.routes.js";
import adminUploadRoutes from "./routes/adminUpload.routes.js";
import adminDiscountRoutes from "./routes/adminDiscount.routes.js";
import adminOfferRoutes from "./routes/adminOffer.routes.js";
import adminAnalyticsRoutes from "./routes/adminAnalytics.routes.js";
import adminServiceRequestRoutes from "./routes/adminServiceRequest.routes.js";
import adminStoreSettingsRoutes from "./routes/adminStoreSettings.routes.js";

import {
  hydrateStoreSettings
} from "./middleware/storeSettings.middleware.js";

import {
  getAllowedOrigins
} from "./config/environment.js";

const app = express();

app.disable(
  "x-powered-by"
);

app.set(
  "trust proxy",
  1
);

const allowedOrigins =
  new Set(
    getAllowedOrigins()
  );

function normalizeOrigin(
  value
) {
  return String(value || "")
    .trim()
    .replace(/\/+$/, "");
}

function isAllowedOrigin(
  origin
) {
  if (!origin) {
    return true;
  }

  return allowedOrigins.has(
    normalizeOrigin(
      origin
    )
  );
}

app.use(
  helmet({
    crossOriginResourcePolicy: {
      policy:
        "cross-origin"
    },

    referrerPolicy: {
      policy:
        "strict-origin-when-cross-origin"
    }
  })
);

app.use(
  cors({
    origin(
      origin,
      callback
    ) {
      if (
        isAllowedOrigin(
          origin
        )
      ) {
        callback(
          null,
          true
        );

        return;
      }

      const error =
        new Error(
          "This website origin is not allowed"
        );

      error.statusCode =
        403;

      callback(error);
    },

    credentials:
      true,

    methods: [
      "GET",
      "HEAD",
      "POST",
      "PUT",
      "PATCH",
      "DELETE",
      "OPTIONS"
    ],

    allowedHeaders: [
      "Content-Type",
      "Authorization",
      "Accept"
    ],

    maxAge:
      86400
  })
);

app.use(
  (
    req,
    res,
    next
  ) => {
    if (
      [
        "GET",
        "HEAD",
        "OPTIONS"
      ].includes(
        req.method
      )
    ) {
      next();
      return;
    }

    const origin =
      req.get("origin");

    /*
     * Paymob and other legitimate
     * server-to-server callbacks do not
     * send a browser Origin header.
     * Browser requests with an Origin
     * must match the allowlist.
     */
    if (
      origin &&
      !isAllowedOrigin(
        origin
      )
    ) {
      res.status(403).json({
        success: false,

        message:
          "This request origin is not allowed"
      });

      return;
    }

    next();
  }
);

app.use(
  rateLimit({
    windowMs:
      15 * 60 * 1000,

    limit:
      300,

    standardHeaders:
      true,

    legacyHeaders:
      false,

    skip(req) {
      return (
        req.path ===
        "/api/health"
      );
    }
  })
);

app.use(
  express.json({
    limit:
      "5mb"
  })
);

app.use(
  express.urlencoded({
    extended:
      true,

    limit:
      "5mb"
  })
);

app.use(
  cookieParser()
);

if (
  process.env.NODE_ENV !==
  "production"
) {
  app.use(
    morgan("dev")
  );
}

app.use(
  "/api/health",
  healthRoutes
);

app.use(
  hydrateStoreSettings
);

app.use(
  "/api/categories",
  categoryRoutes
);

app.use(
  "/api/products",
  productRoutes
);

app.use(
  "/api/store-config",
  storeConfigRoutes
);

app.use(
  "/api/orders",
  orderRoutes
);

app.use(
  "/api/order-tracking",
  orderTrackingRoutes
);

app.use(
  "/api/payments/paymob",
  paymobRoutes
);

app.use(
  "/api/uploads",
  uploadRoutes
);

app.use(
  "/api/discounts",
  discountRoutes
);

app.use(
  "/api/pricing",
  pricingRoutes
);

app.use(
  "/api/service-requests",
  serviceRequestRoutes
);

app.use(
  "/api/admin/auth",
  adminAuthRoutes
);

app.use(
  "/api/admin/orders",
  adminOrderRoutes
);

app.use(
  "/api/admin/categories",
  adminCategoryRoutes
);

app.use(
  "/api/admin/products",
  adminProductRoutes
);

app.use(
  "/api/admin/uploads",
  adminUploadRoutes
);

app.use(
  "/api/admin/discounts",
  adminDiscountRoutes
);

app.use(
  "/api/admin/offers",
  adminOfferRoutes
);

app.use(
  "/api/admin/analytics",
  adminAnalyticsRoutes
);

app.use(
  "/api/admin/service-requests",
  adminServiceRequestRoutes
);

app.use(
  "/api/admin/store-settings",
  adminStoreSettingsRoutes
);

app.use(
  (
    req,
    res
  ) => {
    res.status(404).json({
      success: false,

      message:
        "API route not found"
    });
  }
);

app.use(
  (
    error,
    req,
    res,
    next
  ) => {
    console.error(
      error
    );

    const statusCode =
      Number(
        error.statusCode
      ) ||
      500;

    const response = {
      success: false,

      message:
        process.env.NODE_ENV ===
          "production" &&
        statusCode === 500
          ? "Something went wrong"
          : error.message
    };

    if (
      error.details &&
      process.env.NODE_ENV !==
        "production"
    ) {
      response.details =
        error.details;
    }

    res
      .status(statusCode)
      .json(response);
  }
);

export default app;
