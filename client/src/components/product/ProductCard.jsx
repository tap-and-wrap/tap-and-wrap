import { Gift, Sparkles } from "lucide-react";
import { Link } from "react-router-dom";

function formatPrice(value) {
  return new Intl.NumberFormat("en-EG", {
    style: "currency",
    currency: "EGP",
    maximumFractionDigits: 0
  }).format(value || 0);
}

export default function ProductCard({ product }) {
  const mainImage = product.mainImage?.url || product.images?.[0]?.url || "";
  const hoverImage = product.hoverImage?.url || product.images?.[1]?.url || "";
  const hasSale =
    typeof product.salePrice === "number" && product.salePrice < product.price;

  return (
    <Link
      to={`/products/${product.slug}`}
      className="group overflow-hidden rounded-[1.7rem] border border-[#ead9d2] bg-white/80 shadow-sm transition duration-300 hover:-translate-y-1 hover:shadow-xl hover:shadow-[#4b332b]/10"
    >
      <div className="relative aspect-[4/5] overflow-hidden bg-[#f4e5df]">
        {mainImage ? (
          <>
            <img
              src={mainImage}
              alt={product.name}
              className="h-full w-full object-cover transition duration-500 group-hover:scale-105"
              loading="lazy"
            />

            {hoverImage ? (
              <img
                src={hoverImage}
                alt={product.name}
                className="absolute inset-0 h-full w-full object-cover opacity-0 transition duration-500 group-hover:scale-105 group-hover:opacity-100"
                loading="lazy"
              />
            ) : null}
          </>
        ) : (
          <div className="flex h-full items-center justify-center bg-gradient-to-br from-[#fffaf7] via-[#f4e5df] to-[#e8cdc4] p-8 text-center">
            <div>
              <Gift className="mx-auto text-[#9a766b]" size={42} />
              <p className="mt-4 text-sm font-semibold uppercase tracking-[0.25em] text-[#9a766b]">
                Tap & Wrap
              </p>
              <p className="mt-2 text-lg font-semibold text-[#4b332b]">
                Product image soon
              </p>
            </div>
          </div>
        )}

        <div className="absolute left-4 top-4 flex flex-wrap gap-2">
          {hasSale ? (
            <span className="rounded-full bg-[#2c1f1b] px-3 py-1 text-xs font-semibold text-white">
              Sale
            </span>
          ) : null}

          {product.isBestSeller ? (
            <span className="rounded-full bg-white/90 px-3 py-1 text-xs font-semibold text-[#5a3d34]">
              Best Seller
            </span>
          ) : null}
        </div>
      </div>

      <div className="p-5">
        <div className="mb-3 flex flex-wrap gap-2">
          {product.serviceEligibility?.engraving ? (
            <span className="inline-flex items-center gap-1 rounded-full bg-[#f4e5df] px-3 py-1 text-xs font-semibold text-[#7b584d]">
              <Sparkles size={12} />
              Engraving
            </span>
          ) : null}

          {product.serviceEligibility?.wrapping ? (
            <span className="rounded-full bg-[#fff4ef] px-3 py-1 text-xs font-semibold text-[#7b584d]">
              Wrapping
            </span>
          ) : null}

          {product.serviceEligibility?.photoPrinting ? (
            <span className="rounded-full bg-[#f4e5df] px-3 py-1 text-xs font-semibold text-[#7b584d]">
              Printing
            </span>
          ) : null}
        </div>

        <h3 className="text-lg font-semibold tracking-[-0.02em] text-[#2c1f1b]">
          {product.name}
        </h3>

        <p className="mt-2 min-h-12 text-sm leading-6 text-[#806a62]">
          {product.shortDescription || "A personalized Tap & Wrap gift."}
        </p>

        <div className="mt-4 flex items-center gap-2">
          {hasSale ? (
            <>
              <span className="font-semibold text-[#2c1f1b]">
                {formatPrice(product.salePrice)}
              </span>
              <span className="text-sm text-[#9a766b] line-through">
                {formatPrice(product.price)}
              </span>
            </>
          ) : (
            <span className="font-semibold text-[#2c1f1b]">
              {formatPrice(product.price)}
            </span>
          )}
        </div>
      </div>
    </Link>
  );
}