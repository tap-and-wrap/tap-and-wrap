import {
  MessageCircle,
  PackageSearch,
  Sparkles
} from "lucide-react";
import {
  Link
} from "react-router-dom";
import {
  useQuery
} from "@tanstack/react-query";

import Header from "../components/layout/Header";
import Footer from "../components/layout/Footer";
import PageIntro from "../components/content/PageIntro";
import InstagramIcon from "../components/icons/InstagramIcon";

import {
  getStoreConfig
} from "../features/store/storeApi";

function normalizeWhatsappNumber(value) {
  return String(value || "")
    .replace(/[^\d]/g, "");
}

export default function ContactPage() {
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

  const whatsappNumber =
    storeConfigQuery.data
      ?.config
      ?.contact
      ?.whatsappNumber ||
    "+201508216472";

  const whatsappUrl =
    `https://wa.me/${normalizeWhatsappNumber(
      whatsappNumber
    )}?text=${encodeURIComponent(
      "Hello Tap & Wrap, I need help."
    )}`;

  return (
    <>
      <Header />

      <main
        id="main-content"
        className="mx-auto max-w-6xl px-5 py-14 md:py-18"
      >
        <PageIntro
          eyebrow="Contact"
          title="Let’s make the gift feel right."
          description="Use the fastest support option for an order, or submit a detailed request when the gift needs custom work."
        />

        <section className="mt-10 grid gap-5 md:grid-cols-2">
          <a
            href={whatsappUrl}
            target="_blank"
            rel="noreferrer"
            className="group rounded-[2rem] border border-[#ead9d2] bg-white/90 p-7 shadow-sm transition hover:-translate-y-0.5 hover:shadow-md"
          >
            <MessageCircle
              size={28}
              className="text-[#8a675c]"
            />

            <h2 className="mt-6 text-2xl font-semibold text-[#2c1f1b]">
              WhatsApp support
            </h2>

            <p className="mt-3 leading-7 text-[#735f58]">
              Best for order
              questions, payment
              verification, delivery
              help, and quick product
              questions.
            </p>

            <p className="mt-5 font-semibold text-[#5a3d34]">
              {whatsappNumber}
            </p>
          </a>

          <a
            href="https://www.instagram.com/tapandwrap"
            target="_blank"
            rel="noreferrer"
            className="group rounded-[2rem] border border-[#ead9d2] bg-white/90 p-7 shadow-sm transition hover:-translate-y-0.5 hover:shadow-md"
          >
            <InstagramIcon
              size={28}
              className="text-[#8a675c]"
            />

            <h2 className="mt-6 text-2xl font-semibold text-[#2c1f1b]">
              Instagram
            </h2>

            <p className="mt-3 leading-7 text-[#735f58]">
              Follow new gifts,
              wrapping ideas,
              personalization
              examples, and store
              updates.
            </p>

            <p className="mt-5 font-semibold text-[#5a3d34]">
              @tapandwrap
            </p>
          </a>

          <Link
            to="/track-order"
            className="group rounded-[2rem] border border-[#ead9d2] bg-[#fff8f4] p-7 transition hover:-translate-y-0.5"
          >
            <PackageSearch
              size={28}
              className="text-[#8a675c]"
            />

            <h2 className="mt-6 text-2xl font-semibold text-[#2c1f1b]">
              Track an order
            </h2>

            <p className="mt-3 leading-7 text-[#735f58]">
              Check an order using
              the order number and
              checkout email before
              contacting support.
            </p>
          </Link>

          <Link
            to="/services"
            className="group rounded-[2rem] border border-[#ead9d2] bg-[#fff8f4] p-7 transition hover:-translate-y-0.5"
          >
            <Sparkles
              size={28}
              className="text-[#8a675c]"
            />

            <h2 className="mt-6 text-2xl font-semibold text-[#2c1f1b]">
              Custom request
            </h2>

            <p className="mt-3 leading-7 text-[#735f58]">
              Send engraving,
              printing, wrapping,
              corporate gifting, or
              custom-gift details in
              one organized request.
            </p>
          </Link>
        </section>
      </main>

      <Footer />
    </>
  );
}
