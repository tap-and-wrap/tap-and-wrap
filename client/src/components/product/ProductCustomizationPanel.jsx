import { useMemo, useState } from "react";
import { Camera, Gift, Minus, Package, Plus, Sparkles } from "lucide-react";

import { formatPrice } from "../../utils/cartUtils";

const boxColors = ["Black", "Pink", "White", "Brown", "Gold"];
const ribbonColors = ["Black", "Red", "White", "Gold", "Pink"];
const defaultPlacements = ["Front", "Back", "Side"];

export default function ProductCustomizationPanel({ product, onAddToCart }) {
  const [quantity, setQuantity] = useState(1);

  const [engravingEnabled, setEngravingEnabled] = useState(false);
  const [engravingType, setEngravingType] = useState("text");
  const [engravingText, setEngravingText] = useState("");
  const [engravingPlacement, setEngravingPlacement] = useState("");
  const [engravingImageFileName, setEngravingImageFileName] = useState("");

  const [wrappingEnabled, setWrappingEnabled] = useState(false);
  const [boxColor, setBoxColor] = useState("Black");
  const [ribbonColor, setRibbonColor] = useState("Gold");
  const [giftCard, setGiftCard] = useState(false);
  const [giftCardMessage, setGiftCardMessage] = useState("");
  const [textOnBox, setTextOnBox] = useState(false);
  const [boxText, setBoxText] = useState("");
  const [fillers, setFillers] = useState(false);

  const placements = product.engravingSettings?.placements?.length
    ? product.engravingSettings.placements
    : defaultPlacements;

  const engravingPrice = Number(product.engravingSettings?.basePrice || 0);

  const wrappingPrices = {
    basePrice: 80,
    giftCardPrice: 35,
    textOnBoxPrice: 50,
    fillersPrice: 45
  };

  const productPrice = Number(product.currentPrice || product.salePrice || product.price || 0);

  const estimatedUnitPrice = useMemo(() => {
    let total = productPrice;

    if (engravingEnabled) {
      total += engravingPrice;
    }

    if (wrappingEnabled) {
      total += wrappingPrices.basePrice;
      if (giftCard) total += wrappingPrices.giftCardPrice;
      if (textOnBox) total += wrappingPrices.textOnBoxPrice;
      if (fillers) total += wrappingPrices.fillersPrice;
    }

    return total;
  }, [
    productPrice,
    engravingEnabled,
    engravingPrice,
    wrappingEnabled,
    giftCard,
    textOnBox,
    fillers
  ]);

  function handleQuantityChange(nextQuantity) {
    setQuantity(Math.max(Number(nextQuantity) || 1, 1));
  }

  function handleAddToCart() {
    const engraving = {
      enabled: engravingEnabled,
      type: engravingType,
      text: engravingText.trim(),
      placement: engravingPlacement || placements[0] || "",
      imageFileName: engravingImageFileName,
      price: engravingEnabled ? engravingPrice : 0,
      notes: product.engravingSettings?.notes || ""
    };

    const wrapping = {
      enabled: wrappingEnabled,
      boxColor,
      ribbonColor,
      basePrice: wrappingPrices.basePrice,
      giftCard,
      giftCardMessage: giftCardMessage.trim(),
      giftCardPrice: wrappingPrices.giftCardPrice,
      textOnBox,
      boxText: boxText.trim(),
      textOnBoxPrice: wrappingPrices.textOnBoxPrice,
      fillers,
      fillersPrice: wrappingPrices.fillersPrice
    };

    onAddToCart({
      product,
      quantity,
      engraving,
      wrapping
    });
  }

  return (
    <div className="mt-8 rounded-[1.7rem] border border-[#ead9d2] bg-white/80 p-6 shadow-sm">
      <div className="flex items-start justify-between gap-5">
        <div>
          <h2 className="text-2xl font-semibold tracking-[-0.03em] text-[#2c1f1b]">
            Customize your gift
          </h2>
          <p className="mt-2 leading-7 text-[#735f58]">
            Add engraving, wrapping, gift cards, box text, and finishing touches.
          </p>
        </div>

        <Gift className="shrink-0 text-[#8a675c]" size={30} />
      </div>

      <div className="mt-6 grid gap-4">
        {product.serviceEligibility?.engraving ? (
          <div className="rounded-3xl border border-[#ead9d2] bg-[#fffaf7] p-5">
            <label className="flex cursor-pointer items-center justify-between gap-4">
              <span>
                <span className="flex items-center gap-2 font-semibold text-[#2c1f1b]">
                  <Sparkles size={18} />
                  Add laser engraving
                </span>
                <span className="mt-1 block text-sm text-[#806a62]">
                  Starts from {formatPrice(engravingPrice)}
                </span>
              </span>

              <input
                type="checkbox"
                checked={engravingEnabled}
                onChange={(event) => setEngravingEnabled(event.target.checked)}
                className="h-5 w-5 accent-[#5a3d34]"
              />
            </label>

            {engravingEnabled ? (
              <div className="mt-5 grid gap-4">
                <div className="grid gap-3 sm:grid-cols-2">
                  <label className="grid gap-2 text-sm font-semibold text-[#4b332b]">
                    Engraving type
                    <select
                      value={engravingType}
                      onChange={(event) => setEngravingType(event.target.value)}
                      className="rounded-2xl border border-[#ead9d2] bg-white px-4 py-3 text-[#2c1f1b] outline-none"
                    >
                      <option value="text">Text</option>
                      <option value="image">Image / logo</option>
                    </select>
                  </label>

                  <label className="grid gap-2 text-sm font-semibold text-[#4b332b]">
                    Placement
                    <select
                      value={engravingPlacement}
                      onChange={(event) => setEngravingPlacement(event.target.value)}
                      className="rounded-2xl border border-[#ead9d2] bg-white px-4 py-3 text-[#2c1f1b] outline-none"
                    >
                      {placements.map((placement) => (
                        <option key={placement} value={placement}>
                          {placement}
                        </option>
                      ))}
                    </select>
                  </label>
                </div>

                {engravingType === "text" ? (
                  <label className="grid gap-2 text-sm font-semibold text-[#4b332b]">
                    Engraving text
                    <input
                      value={engravingText}
                      maxLength={product.engravingSettings?.maxCharacters || 80}
                      onChange={(event) => setEngravingText(event.target.value)}
                      placeholder="Example: Sarah 24.06.2026"
                      className="rounded-2xl border border-[#ead9d2] bg-white px-4 py-3 text-[#2c1f1b] outline-none"
                    />
                    <span className="text-xs font-normal text-[#806a62]">
                      {engravingText.length}/{product.engravingSettings?.maxCharacters || 80} characters
                    </span>
                  </label>
                ) : (
                  <label className="grid gap-2 text-sm font-semibold text-[#4b332b]">
                    Upload image / logo
                    <input
                      type="file"
                      accept="image/*"
                      onChange={(event) =>
                        setEngravingImageFileName(event.target.files?.[0]?.name || "")
                      }
                      className="rounded-2xl border border-[#ead9d2] bg-white px-4 py-3 text-[#2c1f1b] outline-none"
                    />
                    <span className="flex items-center gap-2 text-xs font-normal text-[#806a62]">
                      <Camera size={14} />
                      Real Cloudinary upload comes in the next backend step.
                    </span>
                  </label>
                )}

                {product.engravingSettings?.notes ? (
                  <p className="rounded-2xl bg-white p-4 text-sm leading-6 text-[#806a62]">
                    {product.engravingSettings.notes}
                  </p>
                ) : null}
              </div>
            ) : null}
          </div>
        ) : null}

        {product.serviceEligibility?.wrapping ? (
          <div className="rounded-3xl border border-[#ead9d2] bg-[#fffaf7] p-5">
            <label className="flex cursor-pointer items-center justify-between gap-4">
              <span>
                <span className="flex items-center gap-2 font-semibold text-[#2c1f1b]">
                  <Package size={18} />
                  Add gift wrapping
                </span>
                <span className="mt-1 block text-sm text-[#806a62]">
                  Base wrapping {formatPrice(wrappingPrices.basePrice)}
                </span>
              </span>

              <input
                type="checkbox"
                checked={wrappingEnabled}
                onChange={(event) => setWrappingEnabled(event.target.checked)}
                className="h-5 w-5 accent-[#5a3d34]"
              />
            </label>

            {wrappingEnabled ? (
              <div className="mt-5 grid gap-4">
                <div className="grid gap-3 sm:grid-cols-2">
                  <label className="grid gap-2 text-sm font-semibold text-[#4b332b]">
                    Box color
                    <select
                      value={boxColor}
                      onChange={(event) => setBoxColor(event.target.value)}
                      className="rounded-2xl border border-[#ead9d2] bg-white px-4 py-3 text-[#2c1f1b] outline-none"
                    >
                      {boxColors.map((color) => (
                        <option key={color} value={color}>
                          {color}
                        </option>
                      ))}
                    </select>
                  </label>

                  <label className="grid gap-2 text-sm font-semibold text-[#4b332b]">
                    Ribbon color
                    <select
                      value={ribbonColor}
                      onChange={(event) => setRibbonColor(event.target.value)}
                      className="rounded-2xl border border-[#ead9d2] bg-white px-4 py-3 text-[#2c1f1b] outline-none"
                    >
                      {ribbonColors.map((color) => (
                        <option key={color} value={color}>
                          {color}
                        </option>
                      ))}
                    </select>
                  </label>
                </div>

                <div className="grid gap-3">
                  <label className="flex cursor-pointer items-start justify-between gap-4 rounded-2xl bg-white p-4">
                    <span>
                      <span className="font-semibold text-[#2c1f1b]">
                        Add gift card
                      </span>
                      <span className="mt-1 block text-sm text-[#806a62]">
                        + {formatPrice(wrappingPrices.giftCardPrice)}
                      </span>
                    </span>
                    <input
                      type="checkbox"
                      checked={giftCard}
                      onChange={(event) => setGiftCard(event.target.checked)}
                      className="mt-1 h-5 w-5 accent-[#5a3d34]"
                    />
                  </label>

                  {giftCard ? (
                    <textarea
                      value={giftCardMessage}
                      onChange={(event) => setGiftCardMessage(event.target.value)}
                      placeholder="Write the gift card message..."
                      rows={3}
                      className="rounded-2xl border border-[#ead9d2] bg-white px-4 py-3 text-[#2c1f1b] outline-none"
                    />
                  ) : null}

                  <label className="flex cursor-pointer items-start justify-between gap-4 rounded-2xl bg-white p-4">
                    <span>
                      <span className="font-semibold text-[#2c1f1b]">
                        Add text on box
                      </span>
                      <span className="mt-1 block text-sm text-[#806a62]">
                        + {formatPrice(wrappingPrices.textOnBoxPrice)}
                      </span>
                    </span>
                    <input
                      type="checkbox"
                      checked={textOnBox}
                      onChange={(event) => setTextOnBox(event.target.checked)}
                      className="mt-1 h-5 w-5 accent-[#5a3d34]"
                    />
                  </label>

                  {textOnBox ? (
                    <input
                      value={boxText}
                      onChange={(event) => setBoxText(event.target.value)}
                      placeholder="Example: Happy Birthday"
                      className="rounded-2xl border border-[#ead9d2] bg-white px-4 py-3 text-[#2c1f1b] outline-none"
                    />
                  ) : null}

                  <label className="flex cursor-pointer items-start justify-between gap-4 rounded-2xl bg-white p-4">
                    <span>
                      <span className="font-semibold text-[#2c1f1b]">
                        Add gift box fillers
                      </span>
                      <span className="mt-1 block text-sm text-[#806a62]">
                        + {formatPrice(wrappingPrices.fillersPrice)}
                      </span>
                    </span>
                    <input
                      type="checkbox"
                      checked={fillers}
                      onChange={(event) => setFillers(event.target.checked)}
                      className="mt-1 h-5 w-5 accent-[#5a3d34]"
                    />
                  </label>
                </div>
              </div>
            ) : null}
          </div>
        ) : null}
      </div>

      <div className="mt-6 flex flex-col gap-4 rounded-3xl bg-[#2c1f1b] p-5 text-white sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="text-sm text-white/60">Estimated unit price</p>
          <p className="mt-1 text-2xl font-semibold">
            {formatPrice(estimatedUnitPrice)}
          </p>
        </div>

        <div className="flex items-center gap-3">
          <div className="flex items-center rounded-full bg-white/10 p-1">
            <button
              type="button"
              onClick={() => handleQuantityChange(quantity - 1)}
              className="rounded-full p-2 text-white transition hover:bg-white/10"
            >
              <Minus size={16} />
            </button>

            <input
              value={quantity}
              onChange={(event) => handleQuantityChange(event.target.value)}
              className="w-12 bg-transparent text-center font-semibold text-white outline-none"
            />

            <button
              type="button"
              onClick={() => handleQuantityChange(quantity + 1)}
              className="rounded-full p-2 text-white transition hover:bg-white/10"
            >
              <Plus size={16} />
            </button>
          </div>

          <button
            type="button"
            onClick={handleAddToCart}
            className="rounded-full bg-white px-6 py-3 text-sm font-semibold text-[#2c1f1b] transition hover:bg-[#fff4ef]"
          >
            Add to cart
          </button>
        </div>
      </div>
    </div>
  );
}