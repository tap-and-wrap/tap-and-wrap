export function serializeProduct(product) {
  const plainProduct =
    typeof product?.toObject === "function"
      ? product.toObject({
          virtuals: false
        })
      : {
          ...product
        };

  const images = Array.isArray(plainProduct.images)
    ? [...plainProduct.images].sort(
        (first, second) =>
          Number(first.sortOrder || 0) -
          Number(second.sortOrder || 0)
      )
    : [];

  const mainImage =
    images.find((image) => image.isMain) ||
    images[0] ||
    null;

  const hoverImage =
    images.find(
      (image) =>
        String(image.publicId) !==
        String(mainImage?.publicId || "")
    ) || null;

  const price = Number(plainProduct.price || 0);

  const currentPrice =
    typeof plainProduct.salePrice === "number" &&
    plainProduct.salePrice < price
      ? plainProduct.salePrice
      : price;

  return {
    ...plainProduct,
    images,
    currentPrice,
    mainImage,
    hoverImage
  };
}