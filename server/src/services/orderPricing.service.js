import mongoose from "mongoose";

import Product from "../models/Product.js";

import {
  BOX_COLORS,
  RIBBON_COLORS,
  calculateShippingFee,
  calculateWrappingTotal
} from "../config/storeConfig.js";

import {
  isTrustedCustomerUpload
} from "../config/uploadConfig.js";

import {
  createHttpError
} from "../utils/httpError.js";

function applySession(query, session) {
  if (session) {
    query.session(session);
  }

  return query;
}

function getProductPrice(product) {
  const regularPrice = Number(
    product.price || 0
  );

  const salePrice = product.salePrice;

  if (
    typeof salePrice === "number" &&
    salePrice >= 0 &&
    salePrice < regularPrice
  ) {
    return salePrice;
  }

  return regularPrice;
}

function getProductImage(product) {
  if (!product.images?.length) {
    return "";
  }

  const sortedImages = [
    ...product.images
  ].sort(
    (first, second) =>
      Number(first.sortOrder || 0) -
      Number(second.sortOrder || 0)
  );

  const mainImage =
    sortedImages.find(
      (image) => image.isMain
    ) || sortedImages[0];

  return mainImage?.url || "";
}

function buildEngraving(
  product,
  requestedEngraving = {}
) {
  if (!requestedEngraving.enabled) {
    return {
      enabled: false,
      type: "none",
      text: "",
      placement: "",
      imageUrl: "",
      imagePublicId: "",
      imageFileName: "",
      price: 0
    };
  }

  if (
    !product.serviceEligibility
      ?.engraving
  ) {
    throw createHttpError(
      400,
      `${product.name} does not support engraving`
    );
  }

  const settings =
    product.engravingSettings || {};

  const type =
    requestedEngraving.type ||
    "text";

  if (
    type === "text" &&
    settings.allowText === false
  ) {
    throw createHttpError(
      400,
      `${product.name} does not support text engraving`
    );
  }

  if (
    type === "image" &&
    settings.allowImage === false
  ) {
    throw createHttpError(
      400,
      `${product.name} does not support image engraving`
    );
  }

  const text = String(
    requestedEngraving.text || ""
  ).trim();

  if (
    type === "text" &&
    !text
  ) {
    throw createHttpError(
      400,
      `Engraving text is required for ${product.name}`
    );
  }

  const maxCharacters = Number(
    settings.maxCharacters || 80
  );

  if (
    type === "text" &&
    text.length > maxCharacters
  ) {
    throw createHttpError(
      400,
      `Engraving text for ${product.name} cannot exceed ${maxCharacters} characters`
    );
  }

  const imageUrl = String(
    requestedEngraving.imageUrl || ""
  ).trim();

  const imagePublicId = String(
    requestedEngraving.imagePublicId ||
      ""
  ).trim();

  const imageFileName = String(
    requestedEngraving.imageFileName ||
      ""
  ).trim();

  if (type === "image") {
    if (
      !imageUrl ||
      !imagePublicId
    ) {
      throw createHttpError(
        400,
        `Please upload an engraving image for ${product.name}`
      );
    }

    const trustedImage =
      isTrustedCustomerUpload(
        {
          imageUrl,
          imagePublicId
        },
        "engraving"
      );

    if (!trustedImage) {
      throw createHttpError(
        400,
        `The engraving image for ${product.name} is invalid`
      );
    }
  }

  const allowedPlacements =
    Array.isArray(
      settings.placements
    )
      ? settings.placements
      : [];

  const placement =
    String(
      requestedEngraving.placement ||
        ""
    ).trim() ||
    allowedPlacements[0] ||
    "";

  if (
    allowedPlacements.length &&
    !allowedPlacements.includes(
      placement
    )
  ) {
    throw createHttpError(
      400,
      `Invalid engraving placement for ${product.name}`
    );
  }

  return {
    enabled: true,
    type,

    text:
      type === "text"
        ? text
        : "",

    placement,

    imageUrl:
      type === "image"
        ? imageUrl
        : "",

    imagePublicId:
      type === "image"
        ? imagePublicId
        : "",

    imageFileName:
      type === "image"
        ? imageFileName
        : "",

    price: Number(
      settings.basePrice || 0
    )
  };
}

function buildWrapping(
  product,
  requestedWrapping = {}
) {
  if (!requestedWrapping.enabled) {
    return {
      enabled: false,
      boxColor: "",
      ribbonColor: "",
      giftCard: false,
      giftCardMessage: "",
      textOnBox: false,
      boxText: "",
      fillers: false,
      basePrice: 0,
      giftCardPrice: 0,
      textOnBoxPrice: 0,
      fillersPrice: 0,
      total: 0
    };
  }

  if (
    !product.serviceEligibility
      ?.wrapping
  ) {
    throw createHttpError(
      400,
      `${product.name} does not support gift wrapping`
    );
  }

  const boxColor =
    String(
      requestedWrapping.boxColor ||
        ""
    ).trim() ||
    BOX_COLORS[0];

  const ribbonColor =
    String(
      requestedWrapping.ribbonColor ||
        ""
    ).trim() ||
    RIBBON_COLORS[0];

  if (
    !BOX_COLORS.includes(boxColor)
  ) {
    throw createHttpError(
      400,
      `Invalid box color for ${product.name}`
    );
  }

  if (
    !RIBBON_COLORS.includes(
      ribbonColor
    )
  ) {
    throw createHttpError(
      400,
      `Invalid ribbon color for ${product.name}`
    );
  }

  const giftCard = Boolean(
    requestedWrapping.giftCard
  );

  const textOnBox = Boolean(
    requestedWrapping.textOnBox
  );

  const fillers = Boolean(
    requestedWrapping.fillers
  );

  const giftCardMessage = giftCard
    ? String(
        requestedWrapping
          .giftCardMessage || ""
      ).trim()
    : "";

  const boxText = textOnBox
    ? String(
        requestedWrapping.boxText ||
          ""
      ).trim()
    : "";

  if (
    giftCard &&
    !giftCardMessage
  ) {
    throw createHttpError(
      400,
      `Gift card message is required for ${product.name}`
    );
  }

  if (
    textOnBox &&
    !boxText
  ) {
    throw createHttpError(
      400,
      `Box text is required for ${product.name}`
    );
  }

  const prices =
    calculateWrappingTotal({
      enabled: true,
      giftCard,
      textOnBox,
      fillers
    });

  return {
    enabled: true,
    boxColor,
    ribbonColor,
    giftCard,
    giftCardMessage,
    textOnBox,
    boxText,
    fillers,
    ...prices
  };
}

function aggregateQuantities(items) {
  const quantities = new Map();

  for (const item of items) {
    const productId = String(
      item.productId ||
        item.product ||
        ""
    );

    quantities.set(
      productId,
      (quantities.get(productId) ||
        0) +
        Number(item.quantity || 0)
    );
  }

  return quantities;
}

export async function normalizeOrderItems({
  requestedItems,
  session = null
}) {
  const requestedQuantities =
    aggregateQuantities(
      requestedItems
    );

  const productCache =
    new Map();

  const normalizedItems = [];

  for (
    const requestedItem of
      requestedItems
  ) {
    const productId = String(
      requestedItem.productId || ""
    ).trim();

    if (
      !mongoose.Types.ObjectId.isValid(
        productId
      )
    ) {
      throw createHttpError(
        400,
        "One of the selected products is invalid"
      );
    }

    let product =
      productCache.get(productId);

    if (!product) {
      product = await applySession(
        Product.findOne({
          _id: productId,
          isActive: true
        }),
        session
      );

      if (!product) {
        throw createHttpError(
          404,
          "One of the selected products is no longer available"
        );
      }

      productCache.set(
        productId,
        product
      );
    }

    const totalRequested =
      requestedQuantities.get(
        productId
      ) || 0;

    if (
      Number(product.stock || 0) <
      totalRequested
    ) {
      throw createHttpError(
        409,
        `Only ${product.stock} item(s) of ${product.name} are currently available`
      );
    }

    const quantity = Number(
      requestedItem.quantity
    );

    const productUnitPrice =
      getProductPrice(product);

    const engraving =
      buildEngraving(
        product,
        requestedItem.engraving
      );

    const wrapping =
      buildWrapping(
        product,
        requestedItem.wrapping
      );

    const unitTotal =
      productUnitPrice +
      engraving.price +
      wrapping.total;

    const lineTotal =
      unitTotal * quantity;

    normalizedItems.push({
      product: product._id,

      category:
        product.category || null,

      subcategory:
        product.subcategory || null,

      productName:
        product.name,

      productSlug:
        product.slug,

      productImage:
        getProductImage(product),

      sku:
        product.sku || "",

      quantity,
      productUnitPrice,
      engraving,
      wrapping,
      unitTotal,
      lineTotal
    });
  }

  return normalizedItems;
}

export async function decrementStockForItems({
  normalizedItems,
  session
}) {
  const quantities =
    aggregateQuantities(
      normalizedItems.map(
        (item) => ({
          productId:
            item.product,

          quantity:
            item.quantity
        })
      )
    );

  for (const [
    productId,
    quantity
  ] of quantities.entries()) {
    const updatedProduct =
      await Product.findOneAndUpdate(
        {
          _id: productId,

          stock: {
            $gte: quantity
          }
        },

        {
          $inc: {
            stock: -quantity
          }
        },

        {
          returnDocument: "after",
          session
        }
      );

    if (!updatedProduct) {
      throw createHttpError(
        409,
        "One of the selected products no longer has enough stock"
      );
    }
  }
}

export function calculateOrderBaseTotals({
  normalizedItems,
  governorate
}) {
  const subtotal =
    normalizedItems.reduce(
      (total, item) =>
        total +
        Number(item.lineTotal || 0),
      0
    );

  const shippingFee = governorate
    ? calculateShippingFee(
        governorate
      )
    : 0;

  return {
    subtotal,
    shippingFee
  };
}