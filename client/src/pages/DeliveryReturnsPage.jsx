import {
  AlertTriangle,
  CheckCircle2,
  PackageCheck,
  Truck
} from "lucide-react";
import {
  useQuery
} from "@tanstack/react-query";

import Header from "../components/layout/Header";
import Footer from "../components/layout/Footer";
import PageIntro from "../components/content/PageIntro";

import {
  getStoreConfig
} from "../features/store/storeApi";
import {
  formatPrice
} from "../utils/cartUtils";

const sections = [
  {
    icon:
      PackageCheck,

    title:
      "Order preparation",

    text:
      "Preparation time depends on the product, stock availability, personalization, and the details of any custom service. Tap & Wrap may contact the customer when clarification is needed."
  },

  {
    icon:
      CheckCircle2,

    title:
      "Check your order",

    text:
      "Review names, engraving text, uploaded images, recipient details, phone numbers, and delivery address carefully before placing the order. Personalized work follows the submitted information."
  },

  {
    icon:
      AlertTriangle,

    title:
      "Damaged, defective, or incorrect items",

    text:
      "Contact Tap & Wrap as soon as possible with the order number and clear photos. The team will review the issue and arrange the appropriate replacement, correction, or other solution."
  }
];

export default function DeliveryReturnsPage() {
  const storeConfigQuery =
    useQuery({
      queryKey: [
        "store-config"
      ],

      queryFn:
        getStoreConfig,

      staleTime:
        5 * 60 * 1000
    });

  const shipping =
    storeConfigQuery.data
      ?.config
      ?.shipping;

  return (
    <>
      <Header />

      <main
        id="main-content"
        className="mx-auto max-w-6xl px-5 py-14 md:py-18"
      >
        <PageIntro
          eyebrow="Customer information"
          title="Delivery and returns."
          description="Clear expectations for delivery fees, order preparation, personalized products, and support when something is wrong."
        />

        <section className="mt-10 rounded-[2rem] border border-[#ead9d2] bg-white/90 p-7 shadow-sm md:p-9">
          <div className="flex items-start gap-4">
            <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-[#f4e5df] text-[#7b584d]">
              <Truck
                size={23}
              />
            </div>

            <div>
              <h2 className="text-2xl font-semibold text-[#2c1f1b]">
                Delivery fees
              </h2>

              {shipping ? (
                <div className="mt-4 grid gap-3 sm:grid-cols-2">
                  <div className="rounded-2xl bg-[#fff8f4] p-5">
                    <p className="text-sm text-[#806a62]">
                      Cairo & Giza
                    </p>

                    <p className="mt-2 text-2xl font-semibold">
                      {formatPrice(
                        shipping.cairoAndGiza
                      )}
                    </p>
                  </div>

                  <div className="rounded-2xl bg-[#fff8f4] p-5">
                    <p className="text-sm text-[#806a62]">
                      Other governorates
                    </p>

                    <p className="mt-2 text-2xl font-semibold">
                      {formatPrice(
                        shipping.otherGovernorates
                      )}
                    </p>
                  </div>
                </div>
              ) : (
                <p className="mt-4 leading-7 text-[#735f58]">
                  The delivery fee is
                  calculated according
                  to the governorate and
                  shown during checkout.
                </p>
              )}

              <p className="mt-4 leading-7 text-[#735f58]">
                Delivery estimates can
                vary according to the
                destination, order
                volume, product
                availability, and
                customization work.
              </p>
            </div>
          </div>
        </section>

        <section className="mt-6 grid gap-5 md:grid-cols-3">
          {sections.map(
            ({
              icon: Icon,
              title,
              text
            }) => (
              <article
                key={title}
                className="rounded-[1.7rem] border border-[#ead9d2] bg-white/90 p-6 shadow-sm"
              >
                <Icon
                  size={24}
                  className="text-[#8a675c]"
                />

                <h2 className="mt-5 text-xl font-semibold text-[#2c1f1b]">
                  {title}
                </h2>

                <p className="mt-3 leading-7 text-[#735f58]">
                  {text}
                </p>
              </article>
            )
          )}
        </section>

        <section className="mt-6 rounded-[2rem] border border-[#ead9d2] bg-[#fff8f4] p-7 md:p-9">
          <h2 className="text-2xl font-semibold text-[#2c1f1b]">
            Personalized and
            made-to-order products
          </h2>

          <p className="mt-4 leading-8 text-[#735f58]">
            Because personalized,
            engraved, printed, and
            custom-made products are
            produced specifically for
            the customer, they are
            generally not eligible for
            return or exchange due to a
            change of mind. This does
            not remove support for an
            item that arrives damaged,
            defective, or different
            from the confirmed order.
          </p>

          <p className="mt-4 leading-8 text-[#735f58]">
            For non-personalized items,
            eligibility depends on the
            item’s condition, whether
            it has been used, and the
            circumstances of the
            request. Contact Tap &
            Wrap before sending
            anything back.
          </p>
        </section>
      </main>

      <Footer />
    </>
  );
}
