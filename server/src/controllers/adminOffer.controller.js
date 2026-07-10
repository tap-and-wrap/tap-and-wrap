import mongoose from "mongoose";

import BundleOffer from "../models/BundleOffer.js";
import Category from "../models/Category.js";
import Product from "../models/Product.js";

import {
  asyncHandler
} from "../utils/asyncHandler.js";

import {
  createHttpError
} from "../utils/httpError.js";

import {
  escapeRegex
} from "../utils/slug.js";

import {
  createAdminOfferSchema,
  updateAdminOfferSchema
} from "../validators/adminOffer.validator.js";

function uniqueIds(values = []) {
  return [
    ...new Set(
      values
        .map((value) =>
          String(value || "").trim()
        )
        .filter(Boolean)
    )
  ];
}

function getOfferState(offer) {
  if (!offer.isActive) {
    return "inactive";
  }

  const now = new Date();

  if (
    offer.startsAt &&
    new Date(offer.startsAt) > now
  ) {
    return "scheduled";
  }

  if (
    offer.endsAt &&
    new Date(offer.endsAt) < now
  ) {
    return "expired";
  }

  return "active";
}

function serializeOffer(offer) {
  const plainOffer =
    typeof offer?.toObject === "function"
      ? offer.toObject()
      : {
          ...offer
        };

  return {
    ...plainOffer,
    state: getOfferState(plainOffer)
  };
}

function getReferenceId(value) {
  return String(value?._id || value || "");
}

function documentToPayload(offer) {
  return {
    name: offer.name,
    description: offer.description || "",
    type: offer.type,
    scope: offer.scope,

    productIds: (
      offer.products || []
    ).map(getReferenceId),

    categoryIds: (
      offer.categories || []
    ).map(getReferenceId),

    bundleItems: (
      offer.bundleItems || []
    ).map((item) => ({
      productId: getReferenceId(
        item.product
      ),

      quantity: Number(
        item.quantity || 1
      )
    })),

    requiredQuantity:
      offer.requiredQuantity,

    discountMode:
      offer.discountMode,

    discountValue:
      offer.discountValue,

    freeShipping:
      offer.freeShipping,

    allowMultipleApplications:
      offer.allowMultipleApplications,

    maximumApplicationsPerOrder:
      offer.maximumApplicationsPerOrder ??
      null,

    priority:
      offer.priority || 0,

    startsAt: offer.startsAt
      ? new Date(
          offer.startsAt
        ).toISOString()
      : null,

    endsAt: offer.endsAt
      ? new Date(
          offer.endsAt
        ).toISOString()
      : null,

    isActive:
      offer.isActive
  };
}

async function validateIds(
  values,
  label
) {
  for (const value of values) {
    if (
      !mongoose.Types.ObjectId.isValid(
        value
      )
    ) {
      throw createHttpError(
        400,
        `One of the selected ${label} is invalid`
      );
    }
  }
}

async function validateProducts(
  productIds
) {
  const ids = uniqueIds(productIds);

  await validateIds(ids, "products");

  const count =
    await Product.countDocuments({
      _id: {
        $in: ids
      }
    });

  if (count !== ids.length) {
    throw createHttpError(
      400,
      "One or more selected products no longer exist"
    );
  }

  return ids;
}

async function validateCategories(
  categoryIds
) {
  const ids = uniqueIds(categoryIds);

  await validateIds(ids, "categories");

  const count =
    await Category.countDocuments({
      _id: {
        $in: ids
      }
    });

  if (count !== ids.length) {
    throw createHttpError(
      400,
      "One or more selected categories no longer exist"
    );
  }

  return ids;
}

async function normalizeBundleItems(
  bundleItems
) {
  const itemMap = new Map();

  for (const item of bundleItems) {
    const productId = String(
      item.productId || ""
    ).trim();

    if (
      !mongoose.Types.ObjectId.isValid(
        productId
      )
    ) {
      throw createHttpError(
        400,
        "One of the bundle products is invalid"
      );
    }

    itemMap.set(
      productId,
      (itemMap.get(productId) || 0) +
        Number(item.quantity || 0)
    );
  }

  const normalizedItems = [
    ...itemMap.entries()
  ].map(
    ([productId, quantity]) => ({
      productId,
      quantity
    })
  );

  if (!normalizedItems.length) {
    throw createHttpError(
      400,
      "Choose the products included in the bundle"
    );
  }

  await validateProducts(
    normalizedItems.map(
      (item) => item.productId
    )
  );

  const totalQuantity =
    normalizedItems.reduce(
      (total, item) =>
        total + item.quantity,
      0
    );

  if (totalQuantity < 2) {
    throw createHttpError(
      400,
      "A fixed bundle must contain at least two total items"
    );
  }

  return normalizedItems;
}

function validateOfferRules(payload) {
  if (
    payload.startsAt &&
    payload.endsAt &&
    new Date(payload.endsAt) <=
      new Date(payload.startsAt)
  ) {
    throw createHttpError(
      400,
      "Offer expiry date must be after its start date"
    );
  }

  if (
    payload.discountMode ===
      "percentage_off" &&
    (payload.discountValue <= 0 ||
      payload.discountValue > 100)
  ) {
    throw createHttpError(
      400,
      "Percentage discount must be between 1 and 100"
    );
  }

  if (
    [
      "fixed_bundle_price",
      "fixed_amount_off"
    ].includes(
      payload.discountMode
    ) &&
    payload.discountValue <= 0
  ) {
    throw createHttpError(
      400,
      "The offer value must be greater than zero"
    );
  }

  if (
    payload.discountMode === "none" &&
    !payload.freeShipping
  ) {
    throw createHttpError(
      400,
      "The offer must provide a discount or free delivery"
    );
  }

  if (
    !payload.allowMultipleApplications
  ) {
    payload.maximumApplicationsPerOrder =
      1;
  }
}

async function prepareOfferReferences(
  payload
) {
  if (payload.type === "fixed_products") {
    const normalizedItems =
      await normalizeBundleItems(
        payload.bundleItems
      );

    return {
      scope: "selected_products",

      products:
        normalizedItems.map(
          (item) => item.productId
        ),

      categories: [],

      bundleItems:
        normalizedItems.map(
          (item) => ({
            product:
              item.productId,

            quantity:
              item.quantity
          })
        ),

      requiredQuantity:
        normalizedItems.reduce(
          (total, item) =>
            total + item.quantity,
          0
        )
    };
  }

  if (
    payload.requiredQuantity < 2
  ) {
    throw createHttpError(
      400,
      "The required quantity must be at least 2"
    );
  }

  if (
    payload.scope ===
    "all_products"
  ) {
    return {
      scope:
        "all_products",

      products: [],
      categories: [],
      bundleItems: [],

      requiredQuantity:
        payload.requiredQuantity
    };
  }

  if (
    payload.scope ===
    "selected_products"
  ) {
    const products =
      await validateProducts(
        payload.productIds
      );

    if (!products.length) {
      throw createHttpError(
        400,
        "Choose at least one eligible product"
      );
    }

    return {
      scope:
        "selected_products",

      products,
      categories: [],
      bundleItems: [],

      requiredQuantity:
        payload.requiredQuantity
    };
  }

  const categories =
    await validateCategories(
      payload.categoryIds
    );

  if (!categories.length) {
    throw createHttpError(
      400,
      "Choose at least one eligible category"
    );
  }

  return {
    scope:
      "selected_categories",

    products: [],
    categories,
    bundleItems: [],

    requiredQuantity:
      payload.requiredQuantity
  };
}

async function populateOffer(offer) {
  await offer.populate([
    {
      path: "products",
      select:
        "name sku slug price salePrice isActive"
    },
    {
      path: "categories",
      select:
        "name slug level isActive"
    },
    {
      path: "bundleItems.product",
      select:
        "name sku slug price salePrice isActive"
    },
    {
      path: "createdBy",
      select: "name email"
    },
    {
      path: "updatedBy",
      select: "name email"
    }
  ]);

  return offer;
}

export const listAdminOffers =
  asyncHandler(async (req, res) => {
    const search = String(
      req.query.search || ""
    ).trim();

    const state = String(
      req.query.state || "all"
    ).trim();

    const filter = {};

    if (search) {
      const expression =
        new RegExp(
          escapeRegex(search),
          "i"
        );

      filter.$or = [
        {
          name: expression
        },
        {
          description: expression
        }
      ];
    }

    const offers =
      await BundleOffer.find(filter)
        .populate({
          path: "products",
          select:
            "name sku slug price salePrice isActive"
        })
        .populate({
          path: "categories",
          select:
            "name slug level isActive"
        })
        .populate({
          path: "bundleItems.product",
          select:
            "name sku slug price salePrice isActive"
        })
        .sort({
          priority: -1,
          createdAt: -1
        })
        .lean();

    const serializedOffers =
      offers
        .map(serializeOffer)
        .filter((offer) => {
          if (
            !state ||
            state === "all"
          ) {
            return true;
          }

          return (
            offer.state === state
          );
        });

    res.status(200).json({
      success: true,
      offers: serializedOffers
    });
  });

export const createAdminOffer =
  asyncHandler(async (req, res) => {
    const validation =
      createAdminOfferSchema.safeParse(
        req.body
      );

    if (!validation.success) {
      throw createHttpError(
        400,
        "Invalid offer information",
        validation.error.flatten()
      );
    }

    const payload = validation.data;

    validateOfferRules(payload);

    const references =
      await prepareOfferReferences(
        payload
      );

    const offer =
      await BundleOffer.create({
        name: payload.name,
        description:
          payload.description,

        type: payload.type,

        scope:
          references.scope,

        products:
          references.products,

        categories:
          references.categories,

        bundleItems:
          references.bundleItems,

        requiredQuantity:
          references.requiredQuantity,

        discountMode:
          payload.discountMode,

        discountValue:
          payload.discountValue,

        freeShipping:
          payload.freeShipping,

        allowMultipleApplications:
          payload.allowMultipleApplications,

        maximumApplicationsPerOrder:
          payload.allowMultipleApplications
            ? payload.maximumApplicationsPerOrder
            : 1,

        priority:
          payload.priority,

        startsAt:
          payload.startsAt
            ? new Date(
                payload.startsAt
              )
            : null,

        endsAt:
          payload.endsAt
            ? new Date(
                payload.endsAt
              )
            : null,

        isActive:
          payload.isActive,

        createdBy:
          req.admin._id,

        updatedBy:
          req.admin._id
      });

    await populateOffer(offer);

    res.status(201).json({
      success: true,
      message:
        "Bundle offer created successfully",
      offer:
        serializeOffer(offer)
    });
  });

export const updateAdminOffer =
  asyncHandler(async (req, res) => {
    if (
      !mongoose.Types.ObjectId.isValid(
        req.params.id
      )
    ) {
      throw createHttpError(
        400,
        "Offer identifier is invalid"
      );
    }

    const validation =
      updateAdminOfferSchema.safeParse(
        req.body
      );

    if (!validation.success) {
      throw createHttpError(
        400,
        "Invalid offer information",
        validation.error.flatten()
      );
    }

    const offer =
      await BundleOffer.findById(
        req.params.id
      );

    if (!offer) {
      throw createHttpError(
        404,
        "Bundle offer was not found"
      );
    }

    const mergedPayload = {
      ...documentToPayload(offer),
      ...validation.data
    };

    const completeValidation =
      createAdminOfferSchema.safeParse(
        mergedPayload
      );

    if (
      !completeValidation.success
    ) {
      throw createHttpError(
        400,
        "Invalid offer information",
        completeValidation.error.flatten()
      );
    }

    const payload =
      completeValidation.data;

    validateOfferRules(payload);

    const references =
      await prepareOfferReferences(
        payload
      );

    offer.name = payload.name;

    offer.description =
      payload.description;

    offer.type = payload.type;

    offer.scope =
      references.scope;

    offer.products =
      references.products;

    offer.categories =
      references.categories;

    offer.bundleItems =
      references.bundleItems;

    offer.requiredQuantity =
      references.requiredQuantity;

    offer.discountMode =
      payload.discountMode;

    offer.discountValue =
      payload.discountValue;

    offer.freeShipping =
      payload.freeShipping;

    offer.allowMultipleApplications =
      payload.allowMultipleApplications;

    offer.maximumApplicationsPerOrder =
      payload.allowMultipleApplications
        ? payload.maximumApplicationsPerOrder
        : 1;

    offer.priority =
      payload.priority;

    offer.startsAt =
      payload.startsAt
        ? new Date(
            payload.startsAt
          )
        : null;

    offer.endsAt =
      payload.endsAt
        ? new Date(
            payload.endsAt
          )
        : null;

    offer.isActive =
      payload.isActive;

    offer.updatedBy =
      req.admin._id;

    await offer.save();

    await populateOffer(offer);

    res.status(200).json({
      success: true,
      message:
        "Bundle offer updated successfully",
      offer:
        serializeOffer(offer)
    });
  });

export const deleteAdminOffer =
  asyncHandler(async (req, res) => {
    if (
      !mongoose.Types.ObjectId.isValid(
        req.params.id
      )
    ) {
      throw createHttpError(
        400,
        "Offer identifier is invalid"
      );
    }

    const offer =
      await BundleOffer.findById(
        req.params.id
      );

    if (!offer) {
      throw createHttpError(
        404,
        "Bundle offer was not found"
      );
    }

    if (
      offer.usedOrderCount > 0 ||
      offer.applicationCount > 0
    ) {
      throw createHttpError(
        409,
        "This offer has already been used. Deactivate it instead of deleting it."
      );
    }

    await offer.deleteOne();

    res.status(200).json({
      success: true,
      message:
        "Bundle offer deleted successfully"
    });
  });