import { useMemo } from "react";
import {
  ArrowRight,
  ShoppingBag,
  Trash2
} from "lucide-react";
import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";

import Header from "../components/layout/Header";
import Footer from "../components/layout/Footer";
import CartItem from "../components/cart/CartItem";
import DiscountCodeBox from "../components/discount/DiscountCodeBox";
import AppliedOffersBox from "../components/offer/AppliedOffersBox";

import { useCart } from "../context/CartContext";
import {
  getPricingErrorMessage,
  previewOrderPricing
} from "../features/pricing/pricingApi";
import { createOrderItems } from "../utils/orderPayload";
import { formatPrice } from "../utils/cartUtils";

export default function CartPage() {
  const {
    items,
    subtotal,
    discountCode,
    updateQuantity,
    removeItem,
    clearCart,
    setDiscountCode,
    clearDiscountCode
  } = useCart();

  const itemSignature = useMemo(
    () =>
      items
        .map((item) => `${item.id}:${item.quantity}`)
        .join("|"),
    [items]
  );

  const pricingQuery = useQuery({
    queryKey: [
      "order-pricing",
      itemSignature,
      discountCode,
      "cart"
    ],
    queryFn: () =>
      previewOrderPricing({
        items: createOrderItems(items),
        shippingAddress: {
          governorate: ""
        },
        customerEmail: "",
        discountCode
      }),
    enabled: items.length > 0,
    retry: false
  });

  function handleApplyDiscount(code) {
    if (code === discountCode) {
      pricingQuery.refetch();
      return;
    }

    setDiscountCode(code);
  }

  const pricing = pricingQuery.data;
  const offers = pricing?.offers || [];
  const offerDiscount = Number(
    pricing?.totals?.offerDiscount || 0
  );
  const codeDiscount = Number(
    pricing?.totals?.codeDiscount || 0
  );
  const estimatedTotal = pricingQuery.isSuccess
    ? Number(pricing?.totals?.grandTotal || 0)
    : subtotal;

  const pricingError = pricing?.discountError
    ? pricing.discountError
    : pricingQuery.isError
      ? getPricingErrorMessage(pricingQuery.error)
      : "";

  if (!items.length) {
    return (
      <>
        <Header />

        <main className="mx-auto flex min-h-[60vh] max-w-4xl items-center justify-center px-5 py-16">
          <div className="w-full rounded-[2rem] border border-[#ead9d2] bg-white/90 p-10 text-center shadow-sm">
            <ShoppingBag
              size={44}
              className="mx-auto text-[#9a766b]"
            />

            <h1 className="mt-6 text-4xl font-semibold tracking-[-0.04em] text-[#2c1f1b]">
              Your cart is empty.
            </h1>

            <p className="mx-auto mt-4 max-w-lg leading-7 text-[#735f58]">
              Browse Tap & Wrap gifts, choose your customization, and add something special.
            </p>

            <Link
              to="/shop"
              className="mt-7 inline-flex items-center gap-2 rounded-full bg-[#2c1f1b] px-7 py-3.5 text-sm font-semibold text-white transition hover:bg-[#4b332b]"
            >
              Explore the store
              <ArrowRight size={17} />
            </Link>
          </div>
        </main>

        <Footer />
      </>
    );
  }

  return (
    <>
      <Header />

      <main className="mx-auto max-w-7xl px-5 py-12">
        <div className="flex flex-col justify-between gap-5 md:flex-row md:items-end">
          <div>
            <p className="text-sm font-semibold uppercase tracking-[0.25em] text-[#b08a7c]">
              Your selection
            </p>

            <h1 className="mt-3 text-4xl font-semibold tracking-[-0.04em] text-[#2c1f1b] md:text-5xl">
              Shopping cart.
            </h1>

            <p className="mt-4 max-w-2xl leading-7 text-[#735f58]">
              Review products, engraving, wrapping, quantities, bundle offers, and gift details before checkout.
            </p>
          </div>

          <button
            type="button"
            onClick={() =>
              clearCart({
                showNotification: true
              })
            }
            className="inline-flex w-fit items-center gap-2 rounded-full border border-[#ead9d2] bg-white px-5 py-3 text-sm font-semibold text-[#7b584d] transition hover:bg-[#fff4ef]"
          >
            <Trash2 size={16} />
            Clear cart
          </button>
        </div>

        <div className="mt-9 grid gap-8 lg:grid-cols-[1fr_390px]">
          <section className="grid gap-4">
            {items.map((item) => (
              <CartItem
                key={item.id}
                item={item}
                onUpdateQuantity={updateQuantity}
                onRemove={removeItem}
              />
            ))}
          </section>

          <aside className="h-fit lg:sticky lg:top-28">
            <div className="grid gap-5">
              <AppliedOffersBox
                offers={offers}
                totalSavings={offerDiscount}
              />

              <DiscountCodeBox
                value={discountCode}
                onApply={handleApplyDiscount}
                onRemove={clearDiscountCode}
                isChecking={pricingQuery.isFetching}
                result={pricing}
                error={pricingError}
              />

              <div className="rounded-[2rem] border border-[#ead9d2] bg-white/90 p-6 shadow-sm">
                <h2 className="text-2xl font-semibold tracking-[-0.03em] text-[#2c1f1b]">
                  Order summary
                </h2>

                <div className="mt-6 grid gap-4 text-sm">
                  <div className="flex justify-between gap-4 text-[#735f58]">
                    <span>Subtotal</span>

                    <span className="font-semibold text-[#2c1f1b]">
                      {formatPrice(subtotal)}
                    </span>
                  </div>

                  {offerDiscount > 0 ? (
                    <div className="flex justify-between gap-4 text-green-700">
                      <span>Automatic offers</span>

                      <span className="font-semibold">
                        - {formatPrice(offerDiscount)}
                      </span>
                    </div>
                  ) : null}

                  {discountCode ? (
                    <div className="flex justify-between gap-4 text-green-700">
                      <span>
                        Discount code
                        {pricing?.discount?.code
                          ? ` (${pricing.discount.code})`
                          : ""}
                      </span>

                      <span className="font-semibold">
                        - {formatPrice(codeDiscount)}
                      </span>
                    </div>
                  ) : null}

                  <div className="flex justify-between gap-4 border-t border-[#ead9d2] pt-4">
                    <span className="text-lg font-semibold text-[#2c1f1b]">
                      Estimated total
                    </span>

                    <span className="text-xl font-semibold text-[#2c1f1b]">
                      {formatPrice(estimatedTotal)}
                    </span>
                  </div>
                </div>

                <p className="mt-4 text-sm leading-6 text-[#806a62]">
                  Delivery is calculated during checkout. Automatic offers and discount codes are recalculated again by the server when the order is placed.
                </p>

                <Link
                  to="/checkout"
                  className="mt-6 flex w-full items-center justify-center gap-2 rounded-full bg-[#2c1f1b] px-7 py-4 text-sm font-semibold text-white transition hover:bg-[#4b332b]"
                >
                  Continue to checkout
                  <ArrowRight size={17} />
                </Link>

                <Link
                  to="/shop"
                  className="mt-3 flex w-full items-center justify-center rounded-full border border-[#ead9d2] bg-white px-7 py-3.5 text-sm font-semibold text-[#5a3d34] transition hover:bg-[#fff8f4]"
                >
                  Continue shopping
                </Link>
              </div>
            </div>
          </aside>
        </div>
      </main>

      <Footer />
    </>
  );
}
