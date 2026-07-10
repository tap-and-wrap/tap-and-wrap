import Category from "../models/Category.js";
import Product from "../models/Product.js";

import {
  asyncHandler
} from "../utils/asyncHandler.js";

import {
  createHttpError
} from "../utils/httpError.js";

import {
  serializeProduct
} from "../utils/productSerializer.js";

import {
  escapeRegex
} from "../utils/slug.js";

async function getCategoryIds(categorySlug) {
  const category = await Category.findOne({
    slug: categorySlug,
    isActive: true
  }).select("_id");

  if (!category) {
    return [];
  }

  const categoryIds = [category._id];
  let currentParentIds = [category._id];

  while (currentParentIds.length) {
    const children = await Category.find({
      parent: {
        $in: currentParentIds
      },
      isActive: true
    }).select("_id");

    if (!children.length) {
      break;
    }

    const childIds = children.map(
      (child) => child._id
    );

    categoryIds.push(...childIds);
    currentParentIds = childIds;
  }

  return categoryIds;
}

function getPagination(query) {
  const page = Math.max(
    Number.parseInt(query.page, 10) || 1,
    1
  );

  const limit = Math.min(
    Math.max(
      Number.parseInt(query.limit, 10) || 12,
      1
    ),
    100
  );

  return {
    page,
    limit,
    skip: (page - 1) * limit
  };
}

export const getProducts =
  asyncHandler(async (req, res) => {
    const {
      page,
      limit,
      skip
    } = getPagination(req.query);

    const filter = {
      isActive: true
    };

    const search = String(
      req.query.search || ""
    ).trim();

    const categorySlug = String(
      req.query.category || ""
    ).trim();

    const service = String(
      req.query.service || ""
    ).trim();

    const occasion = String(
      req.query.occasion || ""
    ).trim();

    const tag = String(
      req.query.tag || ""
    ).trim();

    if (search) {
      const expression = new RegExp(
        escapeRegex(search),
        "i"
      );

      filter.$or = [
        {
          name: expression
        },
        {
          shortDescription: expression
        },
        {
          description: expression
        },
        {
          tags: expression
        }
      ];
    }

    if (categorySlug) {
      const categoryIds =
        await getCategoryIds(categorySlug);

      if (!categoryIds.length) {
        res.status(200).json({
          success: true,
          products: [],
          pagination: {
            page,
            limit,
            total: 0,
            totalPages: 1,
            hasPreviousPage: false,
            hasNextPage: false
          }
        });

        return;
      }

      filter.$or = [
        ...(filter.$or || []),

        {
          category: {
            $in: categoryIds
          }
        },

        {
          subcategory: {
            $in: categoryIds
          }
        }
      ];

      if (search) {
        const searchConditions =
          filter.$or.slice(
            0,
            filter.$or.length - 2
          );

        const categoryConditions =
          filter.$or.slice(-2);

        delete filter.$or;

        filter.$and = [
          {
            $or: searchConditions
          },
          {
            $or: categoryConditions
          }
        ];
      }
    }

    if (
      [
        "engraving",
        "wrapping",
        "photoPrinting"
      ].includes(service)
    ) {
      filter[
        `serviceEligibility.${service}`
      ] = true;
    }

    if (
      String(req.query.featured) ===
      "true"
    ) {
      filter.isFeatured = true;
    }

    if (
      String(req.query.bestSeller) ===
      "true"
    ) {
      filter.isBestSeller = true;
    }

    if (
      String(req.query.flashSale) ===
      "true"
    ) {
      filter.isFlashSale = true;
    }

    if (occasion) {
      filter.occasions = occasion;
    }

    if (tag) {
      filter.tags = tag;
    }

    const sortMap = {
      newest: {
        createdAt: -1
      },

      oldest: {
        createdAt: 1
      },

      "price-low": {
        price: 1
      },

      "price-high": {
        price: -1
      },

      name: {
        name: 1
      }
    };

    const sort =
      sortMap[req.query.sort] ||
      sortMap.newest;

    const [products, total] =
      await Promise.all([
        Product.find(filter)
          .populate({
            path: "category",
            select: "name slug"
          })
          .populate({
            path: "subcategory",
            select: "name slug"
          })
          .sort(sort)
          .skip(skip)
          .limit(limit)
          .lean(),

        Product.countDocuments(filter)
      ]);

    const totalPages = Math.max(
      Math.ceil(total / limit),
      1
    );

    res.status(200).json({
      success: true,

      products: products.map(
        serializeProduct
      ),

      pagination: {
        page,
        limit,
        total,
        totalPages,
        hasPreviousPage: page > 1,
        hasNextPage: page < totalPages
      }
    });
  });

export const getProductBySlug =
  asyncHandler(async (req, res) => {
    const product =
      await Product.findOne({
        slug: req.params.slug,
        isActive: true
      })
        .populate({
          path: "category",
          select: "name slug"
        })
        .populate({
          path: "subcategory",
          select: "name slug"
        });

    if (!product) {
      throw createHttpError(
        404,
        "Product was not found"
      );
    }

    res.status(200).json({
      success: true,
      product: serializeProduct(product)
    });
  });