import mongoose from "mongoose";

import Category from "../models/Category.js";
import DiscountCode from "../models/DiscountCode.js";
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
  createAdminDiscountSchema,
  updateAdminDiscountSchema
} from "../validators/adminDiscount.validator.js";

function normalizeCode(value) {
  return String(value || "")
    .trim()
    .toUpperCase()
    .replace(/\s+/g, "");
}

function uniqueStrings(values = []) {
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

function getDiscountState(discount) {
  if (!discount.isActive) {
    return "inactive";
  }

  const now = new Date();

  if (
    discount.startsAt &&
    new Date(discount.startsAt) > now
  ) {
    return "scheduled";
  }

  if (
    discount.endsAt &&
    new Date(discount.endsAt) < now
  ) {
    return "expired";
  }

  if (
    discount.usageLimit !== null &&
    discount.usedCount >=
      discount.usageLimit
  ) {
    return "exhausted";
  }

  return "active";
}

function serializeDiscount(discount) {
  const plainDiscount =
    typeof discount?.toObject === "function"
      ? discount.toObject()
      : {
          ...discount
        };

  return {
    ...plainDiscount,
    state: getDiscountState(plainDiscount)
  };
}

function documentToValidationPayload(discount) {
  return {
    name: discount.name,
    code: discount.code,
    description:
      discount.description || "",
    type: discount.type,
    value: discount.value,
    minimumSubtotal:
      discount.minimumSubtotal || 0,
    maximumDiscount:
      discount.maximumDiscount ?? null,
    usageLimit:
      discount.usageLimit ?? null,
    usageLimitPerCustomer:
      discount.usageLimitPerCustomer ??
      null,
    scope: discount.scope,
    productIds: (
      discount.products || []
    ).map((value) =>
      String(value._id || value)
    ),
    categoryIds: (
      discount.categories || []
    ).map((value) =>
      String(value._id || value)
    ),
    startsAt: discount.startsAt
      ? new Date(
          discount.startsAt
        ).toISOString()
      : null,
    endsAt: discount.endsAt
      ? new Date(
          discount.endsAt
        ).toISOString()
      : null,
    isActive: discount.isActive
  };
}

async function validateObjectIds(
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

async function validateScopeReferences(
  scope,
  productIds,
  categoryIds
) {
  if (scope === "all_products") {
    return {
      products: [],
      categories: []
    };
  }

  if (scope === "selected_products") {
    const ids = uniqueStrings(
      productIds
    );

    if (!ids.length) {
      throw createHttpError(
        400,
        "Choose at least one product"
      );
    }

    await validateObjectIds(
      ids,
      "products"
    );

    const existingCount =
      await Product.countDocuments({
        _id: {
          $in: ids
        }
      });

    if (existingCount !== ids.length) {
      throw createHttpError(
        400,
        "One or more selected products no longer exist"
      );
    }

    return {
      products: ids,
      categories: []
    };
  }

  const ids = uniqueStrings(
    categoryIds
  );

  if (!ids.length) {
    throw createHttpError(
      400,
      "Choose at least one category"
    );
  }

  await validateObjectIds(
    ids,
    "categories"
  );

  const existingCount =
    await Category.countDocuments({
      _id: {
        $in: ids
      }
    });

  if (existingCount !== ids.length) {
    throw createHttpError(
      400,
      "One or more selected categories no longer exist"
    );
  }

  return {
    products: [],
    categories: ids
  };
}

function validateBusinessRules(payload) {
  if (
    payload.type === "percentage" &&
    (payload.value <= 0 ||
      payload.value > 100)
  ) {
    throw createHttpError(
      400,
      "Percentage discount must be between 1 and 100"
    );
  }

  if (
    payload.type === "fixed" &&
    payload.value <= 0
  ) {
    throw createHttpError(
      400,
      "Fixed discount must be greater than zero"
    );
  }

  if (
    payload.startsAt &&
    payload.endsAt &&
    new Date(payload.endsAt) <=
      new Date(payload.startsAt)
  ) {
    throw createHttpError(
      400,
      "Expiry date must be after the start date"
    );
  }

  if (
    payload.usageLimit !== null &&
    payload.usageLimitPerCustomer !==
      null &&
    payload.usageLimitPerCustomer >
      payload.usageLimit
  ) {
    throw createHttpError(
      400,
      "Per-customer usage cannot exceed the total usage limit"
    );
  }
}

async function ensureUniqueCode(
  code,
  excludedId = null
) {
  const existingDiscount =
    await DiscountCode.findOne({
      code,

      ...(excludedId
        ? {
            _id: {
              $ne: excludedId
            }
          }
        : {})
    }).select("_id");

  if (existingDiscount) {
    throw createHttpError(
      409,
      "A discount with this code already exists"
    );
  }
}

async function populateDiscount(
  discount
) {
  await discount.populate([
    {
      path: "products",
      select:
        "name sku slug isActive"
    },
    {
      path: "categories",
      select:
        "name slug level isActive"
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

  return discount;
}

export const listAdminDiscounts =
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
          code: expression
        },
        {
          description: expression
        }
      ];
    }

    const discounts =
      await DiscountCode.find(filter)
        .populate({
          path: "products",
          select:
            "name sku slug isActive"
        })
        .populate({
          path: "categories",
          select:
            "name slug level isActive"
        })
        .sort({
          createdAt: -1
        })
        .lean();

    const serializedDiscounts =
      discounts
        .map(serializeDiscount)
        .filter((discount) => {
          if (
            !state ||
            state === "all"
          ) {
            return true;
          }

          return (
            discount.state === state
          );
        });

    res.status(200).json({
      success: true,
      discounts:
        serializedDiscounts
    });
  });

export const createAdminDiscount =
  asyncHandler(async (req, res) => {
    const validation =
      createAdminDiscountSchema.safeParse(
        req.body
      );

    if (!validation.success) {
      throw createHttpError(
        400,
        "Invalid discount information",
        validation.error.flatten()
      );
    }

    const payload = validation.data;

    payload.code = normalizeCode(
      payload.code
    );

    if (
      payload.type ===
      "free_shipping"
    ) {
      payload.value = 0;
      payload.maximumDiscount = null;
    }

    validateBusinessRules(payload);

    await ensureUniqueCode(
      payload.code
    );

    const references =
      await validateScopeReferences(
        payload.scope,
        payload.productIds,
        payload.categoryIds
      );

    const discount =
      await DiscountCode.create({
        name: payload.name,
        code: payload.code,
        description:
          payload.description,
        type: payload.type,
        value: payload.value,
        minimumSubtotal:
          payload.minimumSubtotal,
        maximumDiscount:
          payload.maximumDiscount,
        usageLimit:
          payload.usageLimit,
        usageLimitPerCustomer:
          payload.usageLimitPerCustomer,
        scope: payload.scope,
        products:
          references.products,
        categories:
          references.categories,
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

    await populateDiscount(
      discount
    );

    res.status(201).json({
      success: true,
      message:
        "Discount code created successfully",
      discount:
        serializeDiscount(discount)
    });
  });

export const updateAdminDiscount =
  asyncHandler(async (req, res) => {
    if (
      !mongoose.Types.ObjectId.isValid(
        req.params.id
      )
    ) {
      throw createHttpError(
        400,
        "Discount identifier is invalid"
      );
    }

    const validation =
      updateAdminDiscountSchema.safeParse(
        req.body
      );

    if (!validation.success) {
      throw createHttpError(
        400,
        "Invalid discount information",
        validation.error.flatten()
      );
    }

    const discount =
      await DiscountCode.findById(
        req.params.id
      );

    if (!discount) {
      throw createHttpError(
        404,
        "Discount code was not found"
      );
    }

    const currentPayload =
      documentToValidationPayload(
        discount
      );

    const mergedPayload = {
      ...currentPayload,
      ...validation.data
    };

    mergedPayload.code =
      normalizeCode(
        mergedPayload.code
      );

    if (
      mergedPayload.type ===
      "free_shipping"
    ) {
      mergedPayload.value = 0;
      mergedPayload.maximumDiscount =
        null;
    }

    const completeValidation =
      createAdminDiscountSchema.safeParse(
        mergedPayload
      );

    if (
      !completeValidation.success
    ) {
      throw createHttpError(
        400,
        "Invalid discount information",
        completeValidation.error.flatten()
      );
    }

    const payload =
      completeValidation.data;

    validateBusinessRules(payload);

    await ensureUniqueCode(
      payload.code,
      discount._id
    );

    const references =
      await validateScopeReferences(
        payload.scope,
        payload.productIds,
        payload.categoryIds
      );

    discount.name = payload.name;
    discount.code = payload.code;
    discount.description =
      payload.description;
    discount.type = payload.type;
    discount.value = payload.value;
    discount.minimumSubtotal =
      payload.minimumSubtotal;
    discount.maximumDiscount =
      payload.maximumDiscount;
    discount.usageLimit =
      payload.usageLimit;
    discount.usageLimitPerCustomer =
      payload.usageLimitPerCustomer;
    discount.scope = payload.scope;
    discount.products =
      references.products;
    discount.categories =
      references.categories;
    discount.startsAt =
      payload.startsAt
        ? new Date(
            payload.startsAt
          )
        : null;
    discount.endsAt =
      payload.endsAt
        ? new Date(
            payload.endsAt
          )
        : null;
    discount.isActive =
      payload.isActive;
    discount.updatedBy =
      req.admin._id;

    await discount.save();

    await populateDiscount(
      discount
    );

    res.status(200).json({
      success: true,
      message:
        "Discount code updated successfully",
      discount:
        serializeDiscount(discount)
    });
  });

export const deleteAdminDiscount =
  asyncHandler(async (req, res) => {
    if (
      !mongoose.Types.ObjectId.isValid(
        req.params.id
      )
    ) {
      throw createHttpError(
        400,
        "Discount identifier is invalid"
      );
    }

    const discount =
      await DiscountCode.findById(
        req.params.id
      );

    if (!discount) {
      throw createHttpError(
        404,
        "Discount code was not found"
      );
    }

    if (discount.usedCount > 0) {
      throw createHttpError(
        409,
        "This code has already been used. Deactivate it instead of deleting it."
      );
    }

    await discount.deleteOne();

    res.status(200).json({
      success: true,
      message:
        "Discount code deleted successfully"
    });
  });