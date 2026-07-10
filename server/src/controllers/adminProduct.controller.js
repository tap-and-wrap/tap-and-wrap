import mongoose from "mongoose";

import Category from "../models/Category.js";
import Order from "../models/Order.js";
import Product from "../models/Product.js";

import {
  getCloudinaryClient
} from "../config/cloudinary.js";

import {
  isTrustedUpload
} from "../config/uploadConfig.js";

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
  createSlug,
  escapeRegex
} from "../utils/slug.js";

import {
  createAdminProductSchema,
  updateAdminProductSchema
} from "../validators/adminProduct.validator.js";

function getPagination(query) {
  const page = Math.max(
    Number.parseInt(query.page, 10) || 1,
    1
  );

  const limit = Math.min(
    Math.max(
      Number.parseInt(query.limit, 10) || 20,
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

function normalizeStringArray(values = []) {
  const uniqueValues = new Set();

  for (const value of values) {
    const normalizedValue =
      String(value || "").trim();

    if (normalizedValue) {
      uniqueValues.add(normalizedValue);
    }
  }

  return [...uniqueValues];
}

function normalizeImages(images = []) {
  const publicIds = new Set();

  const sortedImages = [...images].sort(
    (first, second) =>
      Number(first.sortOrder || 0) -
      Number(second.sortOrder || 0)
  );

  for (const image of sortedImages) {
    if (
      !isTrustedUpload(
        {
          url: image.url,
          publicId: image.publicId
        },
        "product_image"
      )
    ) {
      throw createHttpError(
        400,
        "One of the product images is invalid"
      );
    }

    if (publicIds.has(image.publicId)) {
      throw createHttpError(
        400,
        "The same product image cannot be added twice"
      );
    }

    publicIds.add(image.publicId);
  }

  const requestedMainIndex =
    sortedImages.findIndex(
      (image) => image.isMain
    );

  const mainIndex =
    requestedMainIndex >= 0
      ? requestedMainIndex
      : sortedImages.length
        ? 0
        : -1;

  return sortedImages.map((image, index) => ({
    url: image.url,
    publicId: image.publicId,
    alt: String(image.alt || "").trim(),
    isMain: index === mainIndex,
    sortOrder: index
  }));
}

async function createUniqueSlug(
  value,
  excludedId = null
) {
  const baseSlug = createSlug(value);

  if (!baseSlug) {
    throw createHttpError(
      400,
      "A valid product slug could not be generated"
    );
  }

  let candidate = baseSlug;
  let suffix = 2;

  while (
    await Product.exists({
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

async function resolveCategories(
  categoryId,
  subcategoryId
) {
  if (
    !categoryId ||
    !mongoose.Types.ObjectId.isValid(categoryId)
  ) {
    throw createHttpError(
      400,
      "The selected category is invalid"
    );
  }

  const category =
    await Category.findById(categoryId);

  if (!category) {
    throw createHttpError(
      404,
      "The selected category was not found"
    );
  }

  let subcategory = null;

  if (subcategoryId) {
    if (
      !mongoose.Types.ObjectId.isValid(
        subcategoryId
      )
    ) {
      throw createHttpError(
        400,
        "The selected subcategory is invalid"
      );
    }

    subcategory =
      await Category.findById(subcategoryId);

    if (!subcategory) {
      throw createHttpError(
        404,
        "The selected subcategory was not found"
      );
    }

    if (
      String(subcategory.parent || "") !==
      String(category._id)
    ) {
      throw createHttpError(
        400,
        "The selected subcategory does not belong to this category"
      );
    }
  }

  return {
    category,
    subcategory
  };
}

async function removeCloudinaryImages(
  publicIds = []
) {
  if (!publicIds.length) {
    return;
  }

  const cloudinary = getCloudinaryClient();

  const results = await Promise.allSettled(
    publicIds.map((publicId) =>
      cloudinary.uploader.destroy(
        publicId,
        {
          resource_type: "image",
          invalidate: true
        }
      )
    )
  );

  results.forEach((result, index) => {
    if (result.status === "rejected") {
      console.error(
        `Could not remove Cloudinary image ${publicIds[index]}:`,
        result.reason
      );
    }
  });
}

export const listAdminProducts =
  asyncHandler(async (req, res) => {
    const {
      page,
      limit,
      skip
    } = getPagination(req.query);

    const filter = {};

    const search = String(
      req.query.search || ""
    ).trim();

    const categoryId = String(
      req.query.categoryId || ""
    ).trim();

    const status = String(
      req.query.status || "all"
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
          sku: expression
        },
        {
          shortDescription: expression
        },
        {
          tags: expression
        }
      ];
    }

    if (
      categoryId &&
      categoryId !== "all"
    ) {
      if (
        !mongoose.Types.ObjectId.isValid(
          categoryId
        )
      ) {
        throw createHttpError(
          400,
          "Category filter is invalid"
        );
      }

      filter.$or = [
        {
          category: categoryId
        },
        {
          subcategory: categoryId
        }
      ];
    }

    if (status === "active") {
      filter.isActive = true;
    }

    if (status === "inactive") {
      filter.isActive = false;
    }

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
          .sort({
            createdAt: -1
          })
          .skip(skip)
          .limit(limit)
          .lean(),

        Product.countDocuments(filter)
      ]);

    res.status(200).json({
      success: true,

      products: products.map(
        serializeProduct
      ),

      pagination: {
        page,
        limit,
        total,
        totalPages: Math.max(
          Math.ceil(total / limit),
          1
        ),
        hasPreviousPage: page > 1,
        hasNextPage:
          page <
          Math.max(
            Math.ceil(total / limit),
            1
          )
      }
    });
  });

export const getAdminProductById =
  asyncHandler(async (req, res) => {
    if (
      !mongoose.Types.ObjectId.isValid(
        req.params.id
      )
    ) {
      throw createHttpError(
        400,
        "Product identifier is invalid"
      );
    }

    const product = await Product.findById(
      req.params.id
    )
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

export const createAdminProduct =
  asyncHandler(async (req, res) => {
    const validation =
      createAdminProductSchema.safeParse(
        req.body
      );

    if (!validation.success) {
      throw createHttpError(
        400,
        "Invalid product information",
        validation.error.flatten()
      );
    }

    const payload = validation.data;

    if (
      payload.salePrice !== null &&
      payload.salePrice > payload.price
    ) {
      throw createHttpError(
        400,
        "Sale price cannot be greater than the regular price"
      );
    }

    const {
      category,
      subcategory
    } = await resolveCategories(
      payload.categoryId,
      payload.subcategoryId
    );

    const slug = await createUniqueSlug(
      payload.slug || payload.name
    );

    const product = await Product.create({
      name: payload.name,
      slug,
      sku: payload.sku,
      shortDescription:
        payload.shortDescription,
      description: payload.description,
      price: payload.price,
      salePrice: payload.salePrice,
      stock: payload.stock,
      category: category._id,
      subcategory:
        subcategory?._id || null,
      images: normalizeImages(
        payload.images
      ),
      serviceEligibility:
        payload.serviceEligibility,
      engravingSettings: {
        ...payload.engravingSettings,

        placements:
          normalizeStringArray(
            payload.engravingSettings
              .placements
          )
      },
      tags: normalizeStringArray(
        payload.tags
      ),
      occasions: normalizeStringArray(
        payload.occasions
      ),
      badges: normalizeStringArray(
        payload.badges
      ),
      isFeatured: payload.isFeatured,
      isBestSeller:
        payload.isBestSeller,
      isFlashSale:
        payload.isFlashSale,
      isActive: payload.isActive,
      seoTitle: payload.seoTitle,
      seoDescription:
        payload.seoDescription
    });

    await product.populate([
      {
        path: "category",
        select: "name slug"
      },
      {
        path: "subcategory",
        select: "name slug"
      }
    ]);

    res.status(201).json({
      success: true,
      message:
        "Product created successfully",
      product: serializeProduct(product)
    });
  });

export const updateAdminProduct =
  asyncHandler(async (req, res) => {
    if (
      !mongoose.Types.ObjectId.isValid(
        req.params.id
      )
    ) {
      throw createHttpError(
        400,
        "Product identifier is invalid"
      );
    }

    const validation =
      updateAdminProductSchema.safeParse(
        req.body
      );

    if (!validation.success) {
      throw createHttpError(
        400,
        "Invalid product information",
        validation.error.flatten()
      );
    }

    const product =
      await Product.findById(req.params.id);

    if (!product) {
      throw createHttpError(
        404,
        "Product was not found"
      );
    }

    const payload = validation.data;

    const resultingPrice =
      payload.price !== undefined
        ? payload.price
        : product.price;

    const resultingSalePrice =
      payload.salePrice !== undefined
        ? payload.salePrice
        : product.salePrice;

    if (
      resultingSalePrice !== null &&
      resultingSalePrice !== undefined &&
      resultingSalePrice >
        resultingPrice
    ) {
      throw createHttpError(
        400,
        "Sale price cannot be greater than the regular price"
      );
    }

    if (
      payload.categoryId !== undefined ||
      payload.subcategoryId !== undefined
    ) {
      const categoryId =
        payload.categoryId !== undefined
          ? payload.categoryId
          : String(product.category);

      const subcategoryId =
        payload.subcategoryId !== undefined
          ? payload.subcategoryId
          : product.subcategory
            ? String(product.subcategory)
            : null;

      const {
        category,
        subcategory
      } = await resolveCategories(
        categoryId,
        subcategoryId
      );

      product.category = category._id;
      product.subcategory =
        subcategory?._id || null;
    }

    if (payload.name !== undefined) {
      product.name = payload.name;
    }

    if (payload.slug !== undefined) {
      product.slug =
        await createUniqueSlug(
          payload.slug ||
            payload.name ||
            product.name,
          product._id
        );
    }

    if (payload.sku !== undefined) {
      product.sku = payload.sku;
    }

    if (
      payload.shortDescription !==
      undefined
    ) {
      product.shortDescription =
        payload.shortDescription;
    }

    if (
      payload.description !== undefined
    ) {
      product.description =
        payload.description;
    }

    if (payload.price !== undefined) {
      product.price = payload.price;
    }

    if (
      payload.salePrice !== undefined
    ) {
      product.salePrice =
        payload.salePrice;
    }

    if (payload.stock !== undefined) {
      product.stock = payload.stock;
    }

    const previousImagePublicIds =
      product.images.map(
        (image) => image.publicId
      );

    if (payload.images !== undefined) {
      product.images =
        normalizeImages(payload.images);
    }

    if (
      payload.serviceEligibility !==
      undefined
    ) {
      product.serviceEligibility =
        payload.serviceEligibility;
    }

    if (
      payload.engravingSettings !==
      undefined
    ) {
      product.engravingSettings = {
        ...payload.engravingSettings,

        placements:
          normalizeStringArray(
            payload.engravingSettings
              .placements
          )
      };
    }

    if (payload.tags !== undefined) {
      product.tags =
        normalizeStringArray(payload.tags);
    }

    if (
      payload.occasions !== undefined
    ) {
      product.occasions =
        normalizeStringArray(
          payload.occasions
        );
    }

    if (payload.badges !== undefined) {
      product.badges =
        normalizeStringArray(
          payload.badges
        );
    }

    if (
      payload.isFeatured !== undefined
    ) {
      product.isFeatured =
        payload.isFeatured;
    }

    if (
      payload.isBestSeller !==
      undefined
    ) {
      product.isBestSeller =
        payload.isBestSeller;
    }

    if (
      payload.isFlashSale !== undefined
    ) {
      product.isFlashSale =
        payload.isFlashSale;
    }

    if (
      payload.isActive !== undefined
    ) {
      product.isActive =
        payload.isActive;
    }

    if (
      payload.seoTitle !== undefined
    ) {
      product.seoTitle =
        payload.seoTitle;
    }

    if (
      payload.seoDescription !==
      undefined
    ) {
      product.seoDescription =
        payload.seoDescription;
    }

    await product.save();

    if (payload.images !== undefined) {
      const currentPublicIds =
        new Set(
          product.images.map(
            (image) => image.publicId
          )
        );

      const removedPublicIds =
        previousImagePublicIds.filter(
          (publicId) =>
            !currentPublicIds.has(
              publicId
            )
        );

      await removeCloudinaryImages(
        removedPublicIds
      );
    }

    await product.populate([
      {
        path: "category",
        select: "name slug"
      },
      {
        path: "subcategory",
        select: "name slug"
      }
    ]);

    res.status(200).json({
      success: true,
      message:
        "Product updated successfully",
      product: serializeProduct(product)
    });
  });

export const deleteAdminProduct =
  asyncHandler(async (req, res) => {
    if (
      !mongoose.Types.ObjectId.isValid(
        req.params.id
      )
    ) {
      throw createHttpError(
        400,
        "Product identifier is invalid"
      );
    }

    const product =
      await Product.findById(req.params.id);

    if (!product) {
      throw createHttpError(
        404,
        "Product was not found"
      );
    }

    const orderCount =
      await Order.countDocuments({
        "items.product": product._id
      });

    if (orderCount > 0) {
      throw createHttpError(
        409,
        "This product appears in existing orders. Deactivate it instead of deleting it."
      );
    }

    const publicIds =
      product.images.map(
        (image) => image.publicId
      );

    await product.deleteOne();

    await removeCloudinaryImages(
      publicIds
    );

    res.status(200).json({
      success: true,
      message:
        "Product deleted successfully"
    });
  });