import mongoose from "mongoose";

import Category from "../models/Category.js";
import Product from "../models/Product.js";

import { asyncHandler } from "../utils/asyncHandler.js";
import { createHttpError } from "../utils/httpError.js";
import { createSlug } from "../utils/slug.js";

import {
  createAdminCategorySchema,
  updateAdminCategorySchema
} from "../validators/adminCategory.validator.js";

function normalizeParentId(parentId) {
  const value = String(parentId || "").trim();

  return value || null;
}

function normalizeImage(image = {}) {
  return {
    url: String(image.url || "").trim(),
    publicId: String(image.publicId || "").trim(),
    alt: String(image.alt || "").trim()
  };
}

function normalizeServiceDefaults(serviceDefaults = {}) {
  return {
    engraving: Boolean(serviceDefaults.engraving),
    wrapping:
      serviceDefaults.wrapping === undefined
        ? true
        : Boolean(serviceDefaults.wrapping),
    photoPrinting: Boolean(serviceDefaults.photoPrinting)
  };
}

async function getParentCategory(parentId) {
  if (!parentId) {
    return null;
  }

  if (!mongoose.Types.ObjectId.isValid(parentId)) {
    throw createHttpError(
      400,
      "The selected parent category is invalid"
    );
  }

  const parent = await Category.findById(parentId);

  if (!parent) {
    throw createHttpError(
      404,
      "The selected parent category was not found"
    );
  }

  return parent;
}

async function createUniqueSlug(value, excludedId = null) {
  const baseSlug = createSlug(value);

  if (!baseSlug) {
    throw createHttpError(
      400,
      "A valid category slug could not be generated"
    );
  }

  let candidate = baseSlug;
  let suffix = 2;

  while (
    await Category.exists({
      slug: candidate,
      ...(excludedId
        ? {
            _id: {
              $ne: excludedId
            }
          }
        : {})
    })
  ) {
    candidate = `${baseSlug}-${suffix}`;
    suffix += 1;
  }

  return candidate;
}

async function parentWouldCreateCycle(
  categoryId,
  proposedParentId
) {
  if (!proposedParentId) {
    return false;
  }

  let currentId = proposedParentId;

  while (currentId) {
    if (String(currentId) === String(categoryId)) {
      return true;
    }

    const currentCategory = await Category.findById(
      currentId
    ).select("parent");

    if (!currentCategory) {
      return false;
    }

    currentId = currentCategory.parent;
  }

  return false;
}

async function updateDescendantLevels(
  parentCategoryId,
  parentLevel
) {
  const children = await Category.find({
    parent: parentCategoryId
  });

  for (const child of children) {
    const expectedLevel = parentLevel + 1;

    if (child.level !== expectedLevel) {
      child.level = expectedLevel;

      await child.save({
        validateBeforeSave: false
      });
    }

    await updateDescendantLevels(
      child._id,
      expectedLevel
    );
  }
}

function buildUsageMaps(categories, products) {
  const childCountMap = new Map();
  const productCountMap = new Map();

  for (const category of categories) {
    if (!category.parent) {
      continue;
    }

    const parentId = String(
      category.parent._id || category.parent
    );

    childCountMap.set(
      parentId,
      (childCountMap.get(parentId) || 0) + 1
    );
  }

  for (const product of products) {
    const categoryIds = new Set(
      [product.category, product.subcategory]
        .filter(Boolean)
        .map((value) => String(value))
    );

    for (const categoryId of categoryIds) {
      productCountMap.set(
        categoryId,
        (productCountMap.get(categoryId) || 0) + 1
      );
    }
  }

  return {
    childCountMap,
    productCountMap
  };
}

export const listAdminCategories = asyncHandler(
  async (req, res) => {
    const [categories, products] = await Promise.all([
      Category.find()
        .populate({
          path: "parent",
          select: "name slug"
        })
        .sort({
          level: 1,
          sortOrder: 1,
          name: 1
        })
        .lean(),

      Product.find()
        .select("category subcategory")
        .lean()
    ]);

    const {
      childCountMap,
      productCountMap
    } = buildUsageMaps(categories, products);

    const enrichedCategories = categories.map(
      (category) => ({
        ...category,

        childCount:
          childCountMap.get(String(category._id)) || 0,

        productCount:
          productCountMap.get(String(category._id)) || 0
      })
    );

    res.status(200).json({
      success: true,
      categories: enrichedCategories
    });
  }
);

export const createAdminCategory = asyncHandler(
  async (req, res) => {
    const validation =
      createAdminCategorySchema.safeParse(req.body);

    if (!validation.success) {
      throw createHttpError(
        400,
        "Invalid category information",
        validation.error.flatten()
      );
    }

    const payload = validation.data;
    const parentId = normalizeParentId(payload.parentId);
    const parent = await getParentCategory(parentId);

    const slug = await createUniqueSlug(
      payload.slug || payload.name
    );

    const category = await Category.create({
      name: payload.name,
      slug,
      description: payload.description,
      parent: parent?._id || null,
      level: parent ? parent.level + 1 : 0,
      sortOrder: payload.sortOrder,
      showInMenu: payload.showInMenu,
      showOnHome: payload.showOnHome,
      isActive: payload.isActive,

      image: normalizeImage(payload.image),

      serviceDefaults: normalizeServiceDefaults(
        payload.serviceDefaults
      )
    });

    await category.populate({
      path: "parent",
      select: "name slug"
    });

    res.status(201).json({
      success: true,
      message: "Category created successfully",
      category
    });
  }
);

export const updateAdminCategory = asyncHandler(
  async (req, res) => {
    if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
      throw createHttpError(
        400,
        "The category identifier is invalid"
      );
    }

    const validation =
      updateAdminCategorySchema.safeParse(req.body);

    if (!validation.success) {
      throw createHttpError(
        400,
        "Invalid category information",
        validation.error.flatten()
      );
    }

    const category = await Category.findById(req.params.id);

    if (!category) {
      throw createHttpError(
        404,
        "Category was not found"
      );
    }

    const payload = validation.data;

    if (payload.parentId !== undefined) {
      const parentId = normalizeParentId(payload.parentId);

      const createsCycle = await parentWouldCreateCycle(
        category._id,
        parentId
      );

      if (createsCycle) {
        throw createHttpError(
          400,
          "A category cannot be placed inside itself or one of its children"
        );
      }

      const parent = await getParentCategory(parentId);

      category.parent = parent?._id || null;
      category.level = parent ? parent.level + 1 : 0;
    }

    if (payload.name !== undefined) {
      category.name = payload.name;
    }

    if (payload.slug !== undefined) {
      category.slug = await createUniqueSlug(
        payload.slug || payload.name || category.name,
        category._id
      );
    }

    if (payload.description !== undefined) {
      category.description = payload.description;
    }

    if (payload.sortOrder !== undefined) {
      category.sortOrder = payload.sortOrder;
    }

    if (payload.showInMenu !== undefined) {
      category.showInMenu = payload.showInMenu;
    }

    if (payload.showOnHome !== undefined) {
      category.showOnHome = payload.showOnHome;
    }

    if (payload.isActive !== undefined) {
      category.isActive = payload.isActive;
    }

    if (payload.image !== undefined) {
      category.image = normalizeImage(payload.image);
    }

    if (payload.serviceDefaults !== undefined) {
      category.serviceDefaults =
        normalizeServiceDefaults({
          ...category.serviceDefaults?.toObject?.(),
          ...payload.serviceDefaults
        });
    }

    await category.save();

    await updateDescendantLevels(
      category._id,
      category.level
    );

    await category.populate({
      path: "parent",
      select: "name slug"
    });

    res.status(200).json({
      success: true,
      message: "Category updated successfully",
      category
    });
  }
);

export const deleteAdminCategory = asyncHandler(
  async (req, res) => {
    if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
      throw createHttpError(
        400,
        "The category identifier is invalid"
      );
    }

    const category = await Category.findById(req.params.id);

    if (!category) {
      throw createHttpError(
        404,
        "Category was not found"
      );
    }

    const [childCount, productCount] = await Promise.all([
      Category.countDocuments({
        parent: category._id
      }),

      Product.countDocuments({
        $or: [
          {
            category: category._id
          },
          {
            subcategory: category._id
          }
        ]
      })
    ]);

    if (childCount > 0) {
      throw createHttpError(
        409,
        "This category has subcategories. Move or remove them before deleting it."
      );
    }

    if (productCount > 0) {
      throw createHttpError(
        409,
        "This category is used by products. Deactivate it instead of deleting it."
      );
    }

    await category.deleteOne();

    res.status(200).json({
      success: true,
      message: "Category deleted successfully"
    });
  }
);