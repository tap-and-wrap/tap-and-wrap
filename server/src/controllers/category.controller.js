import Category from "../models/Category.js";
import { asyncHandler } from "../utils/asyncHandler.js";

function buildCategoryTree(categories) {
  const categoryMap = new Map();
  const roots = [];

  categories.forEach((category) => {
    const plainCategory = category.toObject ? category.toObject() : category;
    categoryMap.set(String(plainCategory._id), {
      ...plainCategory,
      children: []
    });
  });

  categoryMap.forEach((category) => {
    if (category.parent) {
      const parent = categoryMap.get(String(category.parent));

      if (parent) {
        parent.children.push(category);
        return;
      }
    }

    roots.push(category);
  });

  return roots;
}

export const getCategories = asyncHandler(async (req, res) => {
  const { tree = "true", home, menu } = req.query;

  const filter = {
    isActive: true
  };

  if (home === "true") {
    filter.showOnHome = true;
  }

  if (menu === "true") {
    filter.showInMenu = true;
  }

  const categories = await Category.find(filter)
    .sort({ sortOrder: 1, name: 1 })
    .lean();

  const data = tree === "false" ? categories : buildCategoryTree(categories);

  res.status(200).json({
    success: true,
    count: categories.length,
    categories: data
  });
});

export const getCategoryBySlug = asyncHandler(async (req, res) => {
  const category = await Category.findOne({
    slug: req.params.slug,
    isActive: true
  }).populate("parent", "name slug");

  if (!category) {
    return res.status(404).json({
      success: false,
      message: "Category not found"
    });
  }

  res.status(200).json({
    success: true,
    category
  });
});