export function formatPrice(value) {
  return new Intl.NumberFormat("en-EG", {
    style: "currency",
    currency: "EGP",
    maximumFractionDigits: 0
  }).format(value || 0);
}

export function makeCartItemId({ productId, engraving, wrapping }) {
  const engravingKey = engraving?.enabled
    ? JSON.stringify({
        type: engraving.type,
        text: engraving.text,
        placement: engraving.placement,
        imageFileName: engraving.imageFileName
      })
    : "no-engraving";

  const wrappingKey = wrapping?.enabled
    ? JSON.stringify({
        boxColor: wrapping.boxColor,
        ribbonColor: wrapping.ribbonColor,
        giftCard: wrapping.giftCard,
        giftCardMessage: wrapping.giftCardMessage,
        textOnBox: wrapping.textOnBox,
        boxText: wrapping.boxText,
        fillers: wrapping.fillers
      })
    : "no-wrapping";

  return `${productId}-${engravingKey}-${wrappingKey}`;
}

export function calculateEngravingPrice(engraving) {
  if (!engraving?.enabled) return 0;
  return Number(engraving.price || 0);
}

export function calculateWrappingPrice(wrapping) {
  if (!wrapping?.enabled) return 0;

  let total = Number(wrapping.basePrice || 0);

  if (wrapping.giftCard) total += Number(wrapping.giftCardPrice || 0);
  if (wrapping.textOnBox) total += Number(wrapping.textOnBoxPrice || 0);
  if (wrapping.fillers) total += Number(wrapping.fillersPrice || 0);

  return total;
}

export function calculateLineUnitPrice(item) {
  const productPrice = Number(item.product?.currentPrice || item.product?.salePrice || item.product?.price || 0);
  const engravingPrice = calculateEngravingPrice(item.engraving);
  const wrappingPrice = calculateWrappingPrice(item.wrapping);

  return productPrice + engravingPrice + wrappingPrice;
}

export function calculateLineTotal(item) {
  return calculateLineUnitPrice(item) * Number(item.quantity || 1);
}

export function calculateCartSubtotal(items) {
  return items.reduce((total, item) => total + calculateLineTotal(item), 0);
}