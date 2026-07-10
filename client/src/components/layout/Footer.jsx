import {
  MessageCircle
} from "lucide-react";
import {
  Link
} from "react-router-dom";
import {
  useQuery
} from "@tanstack/react-query";

import InstagramIcon from "../icons/InstagramIcon";

import {
  getStoreConfig
} from "../../features/store/storeApi";
import {
  formatPrice
} from "../../utils/cartUtils";

function normalizeWhatsappNumber(value) {
  return String(value || "")
    .replace(/[^\d]/g, "");
}

export default function Footer() {
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

  const config =
    storeConfigQuery.data
      ?.config;

  const whatsappNumber =
    config?.contact
      ?.whatsappNumber ||
    "+201508216472";

  const whatsappUrl =
    `https://wa.me/${normalizeWhatsappNumber(
      whatsappNumber
    )}?text=${encodeURIComponent(
      "Hello Tap & Wrap, I need help."
    )}`;

  const cairoFee =
    config?.shipping
      ?.cairoAndGiza;

  const otherFee =
    config?.shipping
      ?.otherGovernorates;

  return (
    <footer className="border-t border-[#ead9d2] bg-white/70">
      <div className="mx-auto grid max-w-7xl gap-10 px-5 py-12 sm:grid-cols-2 lg:grid-cols-[1.25fr_0.75fr_0.75fr_0.9fr]">
        <div>
          <Link
            to="/"
            className="inline-block"
          >
            <h2 className="text-2xl font-semibold tracking-[0.22em] text-[#5a3d34]">
              TAP & WRAP
            </h2>
          </Link>

          <p className="mt-4 max-w-md leading-7 text-[#735f58]">
            Thoughtful gifts,
            engraving, wrapping,
            printing, and custom
            gifting made warmer and
            more personal.
          </p>

          {cairoFee !==
            undefined &&
          otherFee !==
            undefined ? (
            <p className="mt-4 text-sm leading-6 text-[#806a62]">
              Delivery: Cairo & Giza{" "}
              <strong>
                {formatPrice(
                  cairoFee
                )}
              </strong>{" "}
              · Other governorates{" "}
              <strong>
                {formatPrice(
                  otherFee
                )}
              </strong>
            </p>
          ) : null}
        </div>

        <div>
          <h3 className="font-semibold text-[#2c1f1b]">
            Shop
          </h3>

          <div className="mt-4 grid gap-3 text-sm text-[#735f58]">
            <Link
              to="/shop"
              className="transition hover:text-[#2c1f1b]"
            >
              All gifts
            </Link>

            <Link
              to="/services"
              className="transition hover:text-[#2c1f1b]"
            >
              Personalization
            </Link>

            <Link
              to="/cart"
              className="transition hover:text-[#2c1f1b]"
            >
              Your cart
            </Link>
          </div>
        </div>

        <div>
          <h3 className="font-semibold text-[#2c1f1b]">
            Support
          </h3>

          <div className="mt-4 grid gap-3 text-sm text-[#735f58]">
            <Link
              to="/track-order"
              className="transition hover:text-[#2c1f1b]"
            >
              Track order
            </Link>

            <Link
              to="/faq"
              className="transition hover:text-[#2c1f1b]"
            >
              FAQ
            </Link>

            <Link
              to="/delivery-returns"
              className="transition hover:text-[#2c1f1b]"
            >
              Delivery & returns
            </Link>

            <Link
              to="/contact"
              className="transition hover:text-[#2c1f1b]"
            >
              Contact
            </Link>
          </div>
        </div>

        <div>
          <h3 className="font-semibold text-[#2c1f1b]">
            Policies
          </h3>

          <div className="mt-4 grid gap-3 text-sm text-[#735f58]">
            <Link
              to="/privacy-policy"
              className="transition hover:text-[#2c1f1b]"
            >
              Privacy Policy
            </Link>

            <Link
              to="/terms"
              className="transition hover:text-[#2c1f1b]"
            >
              Terms & Conditions
            </Link>
          </div>

          <div className="mt-5 flex flex-wrap gap-2">
            <a
              href={whatsappUrl}
              target="_blank"
              rel="noreferrer"
              aria-label="Contact Tap & Wrap on WhatsApp"
              className="inline-flex h-10 w-10 items-center justify-center rounded-full border border-[#ead9d2] bg-white text-[#5a3d34] transition hover:bg-[#fff4ef]"
            >
              <MessageCircle
                size={18}
              />
            </a>

            <a
              href="https://www.instagram.com/tapandwrap"
              target="_blank"
              rel="noreferrer"
              aria-label="Tap & Wrap on Instagram"
              className="inline-flex h-10 w-10 items-center justify-center rounded-full border border-[#ead9d2] bg-white text-[#5a3d34] transition hover:bg-[#fff4ef]"
            >
              <InstagramIcon
                size={18}
              />
            </a>
          </div>
        </div>
      </div>

      <div className="border-t border-[#ead9d2] px-5 py-5 text-center text-sm text-[#806a62]">
        © {new Date().getFullYear()} Tap & Wrap. Built by Web District.
      </div>
    </footer>
  );
}
