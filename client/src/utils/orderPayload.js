export function createOrderItems(
  items
) {
  return items.map((item) => ({
    productId:
      item.product?._id ||
      item.productId ||
      item._id,

    quantity:
      Number(item.quantity),

    engraving: {
      enabled: Boolean(
        item.engraving?.enabled
      ),

      type:
        item.engraving?.type ||
        "text",

      text:
        item.engraving?.text ||
        "",

      placement:
        item.engraving
          ?.placement || "",

      imageUrl:
        item.engraving
          ?.imageUrl || "",

      imagePublicId:
        item.engraving
          ?.imagePublicId || "",

      imageFileName:
        item.engraving
          ?.imageFileName || ""
    },

    wrapping: {
      enabled: Boolean(
        item.wrapping?.enabled
      ),

      boxColor:
        item.wrapping
          ?.boxColor || "",

      ribbonColor:
        item.wrapping
          ?.ribbonColor || "",

      giftCard: Boolean(
        item.wrapping
          ?.giftCard
      ),

      giftCardMessage:
        item.wrapping
          ?.giftCardMessage || "",

      textOnBox: Boolean(
        item.wrapping
          ?.textOnBox
      ),

      boxText:
        item.wrapping
          ?.boxText || "",

      fillers: Boolean(
        item.wrapping?.fillers
      )
    }
  }));
}