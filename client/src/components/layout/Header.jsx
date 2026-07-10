import {
  Menu,
  MessageCircle,
  ShoppingBag,
  X
} from "lucide-react";
import {
  Link,
  NavLink,
  useLocation
} from "react-router-dom";
import {
  useEffect,
  useMemo,
  useState
} from "react";
import {
  useQuery
} from "@tanstack/react-query";

import {
  useCart
} from "../../context/CartContext";
import {
  getStoreConfig
} from "../../features/store/storeApi";

const navigationItems = [
  {
    label: "Shop",
    to: "/shop"
  },
  {
    label: "Services",
    to: "/services"
  },
  {
    label: "Track Order",
    to: "/track-order"
  },
  {
    label: "FAQ",
    to: "/faq"
  },
  {
    label: "Contact",
    to: "/contact"
  }
];

function normalizeWhatsappNumber(value) {
  return String(value || "")
    .replace(/[^\d]/g, "");
}

function navigationClassName({
  isActive
}) {
  return `transition ${
    isActive
      ? "text-[#2c1f1b]"
      : "text-[#6f5a52] hover:text-[#2c1f1b]"
  }`;
}

export default function Header() {
  const {
    itemCount
  } = useCart();

  const location =
    useLocation();

  const [
    menuOpen,
    setMenuOpen
  ] = useState(false);

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
    useMemo(() => {
      const normalized =
        normalizeWhatsappNumber(
          whatsappNumber
        );

      return `https://wa.me/${normalized}?text=${encodeURIComponent(
        "Hello Tap & Wrap, I need help with a gift order."
      )}`;
    }, [
      whatsappNumber
    ]);

  useEffect(() => {
    setMenuOpen(false);
  }, [
    location.pathname,
    location.hash
  ]);

  useEffect(() => {
    if (!menuOpen) {
      return undefined;
    }

    const originalOverflow =
      document.body.style
        .overflow;

    document.body.style
      .overflow = "hidden";

    return () => {
      document.body.style
        .overflow =
        originalOverflow;
    };
  }, [
    menuOpen
  ]);

  return (
    <>
      <a
        href="#main-content"
        className="skip-link"
      >
        Skip to content
      </a>

      <header className="sticky top-0 z-50 border-b border-[#ead9d2]/70 bg-[#fffaf7]/90 backdrop-blur-xl">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-5 py-4">
          <Link
            to="/"
            className="group shrink-0"
            aria-label="Tap & Wrap home"
          >
            <p className="text-xl font-semibold tracking-[0.22em] text-[#5a3d34] md:text-2xl">
              TAP & WRAP
            </p>

            <p className="mt-0.5 hidden text-xs tracking-[0.26em] text-[#9a766b] sm:block">
              UNLOCK THE MAGIC OF GIVING
            </p>
          </Link>

          <nav
            aria-label="Primary navigation"
            className="hidden items-center gap-7 text-sm font-semibold lg:flex"
          >
            {navigationItems.map(
              (item) => (
                <NavLink
                  key={item.to}
                  to={item.to}
                  className={
                    navigationClassName
                  }
                >
                  {item.label}
                </NavLink>
              )
            )}
          </nav>

          <div className="flex items-center gap-3">
            <a
              href={whatsappUrl}
              target="_blank"
              rel="noreferrer"
              className="hidden items-center gap-2 rounded-full bg-[#5a3d34] px-5 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-[#3d2923] sm:inline-flex"
            >
              <MessageCircle
                size={17}
              />

              WhatsApp
            </a>

            <Link
              to="/cart"
              aria-label={`Cart with ${itemCount} item${
                itemCount === 1
                  ? ""
                  : "s"
              }`}
              className="relative rounded-full border border-[#ead9d2] bg-white/80 p-2.5 text-[#5a3d34] transition hover:bg-white"
            >
              <ShoppingBag
                size={20}
              />

              {itemCount > 0 ? (
                <span className="absolute -right-1.5 -top-1.5 flex h-5 min-w-5 items-center justify-center rounded-full bg-[#2c1f1b] px-1 text-xs font-semibold text-white">
                  {itemCount}
                </span>
              ) : null}
            </Link>

            <button
              type="button"
              aria-label={
                menuOpen
                  ? "Close menu"
                  : "Open menu"
              }
              aria-expanded={
                menuOpen
              }
              aria-controls="mobile-navigation"
              onClick={() =>
                setMenuOpen(
                  (current) =>
                    !current
                )
              }
              className="rounded-full border border-[#ead9d2] bg-white/80 p-2.5 text-[#5a3d34] transition hover:bg-white lg:hidden"
            >
              {menuOpen ? (
                <X size={20} />
              ) : (
                <Menu size={20} />
              )}
            </button>
          </div>
        </div>

        {menuOpen ? (
          <div
            id="mobile-navigation"
            className="border-t border-[#ead9d2] bg-[#fffaf7] px-5 pb-6 pt-4 shadow-xl lg:hidden"
          >
            <nav
              aria-label="Mobile navigation"
              className="mx-auto grid max-w-7xl gap-2"
            >
              {navigationItems.map(
                (item) => (
                  <NavLink
                    key={item.to}
                    to={item.to}
                    className={({
                      isActive
                    }) =>
                      `rounded-2xl px-4 py-3.5 text-sm font-semibold transition ${
                        isActive
                          ? "bg-[#2c1f1b] text-white"
                          : "bg-white text-[#5a3d34] hover:bg-[#fff4ef]"
                      }`
                    }
                  >
                    {item.label}
                  </NavLink>
                )
              )}

              <a
                href={whatsappUrl}
                target="_blank"
                rel="noreferrer"
                className="mt-2 inline-flex items-center justify-center gap-2 rounded-2xl border border-[#d8bfb6] bg-white px-4 py-3.5 text-sm font-semibold text-[#4b332b]"
              >
                <MessageCircle
                  size={17}
                />

                Contact on WhatsApp
              </a>
            </nav>
          </div>
        ) : null}
      </header>
    </>
  );
}
