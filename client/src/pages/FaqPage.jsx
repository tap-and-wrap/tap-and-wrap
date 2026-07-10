import {
  ChevronDown,
  MessageCircle
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

const generalQuestions = [
  {
    question:
      "Can I send a gift directly to another person?",

    answer:
      "Yes. Checkout includes separate customer and recipient details, so the gift can be delivered directly to the recipient."
  },

  {
    question:
      "Can I add engraving, wrapping, or a gift message?",

    answer:
      "Available product options appear on the product page. For a request that needs more detail, use the Services page and submit a custom request."
  },

  {
    question:
      "How do I track my order?",

    answer:
      "Open Track Order and enter the order number together with the same email used during checkout."
  },

  {
    question:
      "Which payment methods are available?",

    answer:
      "Available methods are shown securely during checkout. Depending on the current store settings, these may include Cash on Delivery, InstaPay, Vodafone Cash, and card payment through Paymob."
  },

  {
    question:
      "Why does a manual payment need a screenshot?",

    answer:
      "InstaPay and Vodafone Cash transfers require a clear payment screenshot so the admin can verify the transfer before preparation continues."
  },

  {
    question:
      "Can I change or cancel an order?",

    answer:
      "Contact Tap & Wrap as quickly as possible. Changes are not guaranteed after preparation, personalization, or production begins."
  },

  {
    question:
      "Can personalized products be returned?",

    answer:
      "Personalized and made-to-order items are generally not returnable because they were created specifically for the customer. Tap & Wrap will still review damaged, defective, or incorrect orders and provide an appropriate solution."
  },

  {
    question:
      "How are custom service requests handled?",

    answer:
      "After submitting a service request, Tap & Wrap reviews the details, may contact you for clarification, and can send a quote before work starts."
  }
];

export default function FaqPage() {
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

  const questions = [
    {
      question:
        "How much is delivery?",

      answer:
        shipping
          ? `Delivery is ${formatPrice(
              shipping.cairoAndGiza
            )} for Cairo and Giza, and ${formatPrice(
              shipping.otherGovernorates
            )} for other governorates. The final delivery fee is calculated and verified during checkout.`
          : "The delivery fee is calculated according to the selected governorate and shown during checkout."
    },

    ...generalQuestions
  ];

  return (
    <>
      <Header />

      <main
        id="main-content"
        className="mx-auto max-w-5xl px-5 py-14 md:py-18"
      >
        <PageIntro
          eyebrow="Help center"
          title="Questions, answered clearly."
          description="Everything customers usually need to know about ordering, personalization, payment, delivery, tracking, and support."
        />

        <section className="mt-10 grid gap-4">
          {questions.map(
            (
              item,
              index
            ) => (
              <details
                key={
                  item.question
                }
                open={
                  index === 0
                }
                className="group rounded-[1.6rem] border border-[#ead9d2] bg-white/90 p-5 shadow-sm"
              >
                <summary className="flex cursor-pointer list-none items-center justify-between gap-4 font-semibold text-[#2c1f1b]">
                  <span>
                    {item.question}
                  </span>

                  <ChevronDown
                    size={19}
                    className="shrink-0 transition group-open:rotate-180"
                  />
                </summary>

                <p className="mt-4 border-t border-[#ead9d2] pt-4 leading-7 text-[#735f58]">
                  {item.answer}
                </p>
              </details>
            )
          )}
        </section>

        <section className="mt-10 rounded-[2rem] bg-[#2c1f1b] p-7 text-white md:p-9">
          <MessageCircle
            size={27}
            className="text-[#e6c9bf]"
          />

          <h2 className="mt-5 text-2xl font-semibold">
            Still need help?
          </h2>

          <p className="mt-3 max-w-2xl leading-7 text-white/70">
            Contact Tap & Wrap with
            your order number or the
            details of your custom
            request, and the team can
            help directly.
          </p>

          <a
            href="https://wa.me/201508216472"
            target="_blank"
            rel="noreferrer"
            className="mt-6 inline-flex rounded-full bg-white px-6 py-3 text-sm font-semibold text-[#2c1f1b]"
          >
            Contact on WhatsApp
          </a>
        </section>
      </main>

      <Footer />
    </>
  );
}
