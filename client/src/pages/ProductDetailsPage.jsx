import { useMemo, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { Gift, Package, Sparkles, Truck } from "lucide-react";

import Header from "../components/layout/Header";
import Footer from "../components/layout/Footer";
import LoadingState from "../components/ui/LoadingState";
import ErrorState from "../components/ui/ErrorState";
import ProductCustomizationPanel from "../components/product/ProductCustomizationPanel";
import { useCart } from "../context/CartContext";
import { getProductBySlug } from "../features/products/productApi";
import { formatPrice } from "../utils/cartUtils";

export default function ProductDetailsPage() {
  const { slug } = useParams();
  const [activeImageIndex, setActiveImageIndex] = useState(0);
  const { addToCart } = useCart();

  const { data, isLoading, isError } = useQuery({
    queryKey: ["product", slug],
    queryFn: () => getProductBySlug(slug),
    enabled: Boolean(slug)
  });

  const product = data?.product;
  const images = product?.images || [];

  const activeImage = useMemo(() => {
    if (!images.length) return null;
    return images[activeImageIndex] || images[0];
  }, [images, activeImageIndex]);

  const hasSale =
    product &&
    typeof product.salePrice === "number" &&
    product.salePrice < product.price;

  return (
    <>
      <Header />

      <main className="mx-auto max-w-7xl px-5 py-12">
        {isLoading ? <LoadingState label="Loading product..." /> : null}

        {isError ? (
          <ErrorState message="Could not load product. Make sure the backend is running." />
        ) : null}

        {product ? (
          <>
            <div className="mb-8 text-sm text-[#806a62]">
              <Link to="/shop" className="hover:text-[#2c1f1b]">
                Shop
              </Link>
              <span className="mx-2">/</span>
              <span>{product.name}</span>
            </div>

            <section className="grid gap-10 lg:grid-cols-[0.95fr_1.05fr]">
              <div>
                <div className="aspect-[4/5] overflow-hidden rounded-[2rem] border border-[#ead9d2] bg-[#f4e5df] shadow-sm">
                  {activeImage ? (
                    <img
                      src={activeImage.url}
                      alt={activeImage.alt || product.name}
                      className="h-full w-full object-cover"
                    />
                  ) : (
                    <div className="flex h-full items-center justify-center bg-gradient-to-br from-[#fffaf7] via-[#f4e5df] to-[#e8cdc4] p-8 text-center">
                      <div>
                        <Gift className="mx-auto text-[#9a766b]" size={52} />
                        <p className="mt-5 text-sm font-semibold uppercase tracking-[0.25em] text-[#9a766b]">
                          Tap & Wrap
                        </p>
                        <h2 className="mt-3 text-3xl font-semibold text-[#4b332b]">
                          Product image soon
                        </h2>
                      </div>
                    </div>
                  )}
                </div>

                {images.length > 1 ? (
                  <div className="mt-4 grid grid-cols-5 gap-3">
                    {images.map((image, index) => (
                      <button
                        key={`${image.url}-${index}`}
                        type="button"
                        onClick={() => setActiveImageIndex(index)}
                        className={`aspect-square overflow-hidden rounded-2xl border bg-white ${
                          activeImageIndex === index
                            ? "border-[#5a3d34]"
                            : "border-[#ead9d2]"
                        }`}
                      >
                        <img
                          src={image.url}
                          alt={image.alt || product.name}
                          className="h-full w-full object-cover"
                        />
                      </button>
                    ))}
                  </div>
                ) : null}
              </div>

              <div>
                <p className="text-sm font-semibold uppercase tracking-[0.25em] text-[#b08a7c]">
                  {product.category?.name || "Tap & Wrap"}
                </p>

                <h1 className="mt-3 text-5xl font-semibold leading-tight tracking-[-0.05em] text-[#2c1f1b]">
                  {product.name}
                </h1>

                <p className="mt-5 max-w-2xl text-lg leading-8 text-[#735f58]">
                  {product.shortDescription}
                </p>

                <div className="mt-6 flex items-center gap-3">
                  {hasSale ? (
                    <>
                      <span className="text-3xl font-semibold text-[#2c1f1b]">
                        {formatPrice(product.salePrice)}
                      </span>
                      <span className="text-lg text-[#9a766b] line-through">
                        {formatPrice(product.price)}
                      </span>
                    </>
                  ) : (
                    <span className="text-3xl font-semibold text-[#2c1f1b]">
                      {formatPrice(product.price)}
                    </span>
                  )}
                </div>

                <div className="mt-7 flex flex-wrap gap-2">
                  {product.badges?.map((badge) => (
                    <span
                      key={badge}
                      className="rounded-full bg-[#f4e5df] px-3 py-1 text-xs font-semibold text-[#7b584d]"
                    >
                      {badge}
                    </span>
                  ))}
                </div>

                <div className="mt-8 grid gap-3 sm:grid-cols-3">
                  {product.serviceEligibility?.engraving ? (
                    <div className="rounded-3xl border border-[#ead9d2] bg-white/75 p-5">
                      <Sparkles className="text-[#8a675c]" size={24} />
                      <h3 className="mt-4 font-semibold text-[#2c1f1b]">
                        Engraving
                      </h3>
                      <p className="mt-2 text-sm leading-6 text-[#806a62]">
                        Text, logo, or image depending on product.
                      </p>
                    </div>
                  ) : null}

                  {product.serviceEligibility?.wrapping ? (
                    <div className="rounded-3xl border border-[#ead9d2] bg-white/75 p-5">
                      <Package className="text-[#8a675c]" size={24} />
                      <h3 className="mt-4 font-semibold text-[#2c1f1b]">
                        Wrapping
                      </h3>
                      <p className="mt-2 text-sm leading-6 text-[#806a62]">
                        Box, ribbon, fillers, card, and text.
                      </p>
                    </div>
                  ) : null}

                  <div className="rounded-3xl border border-[#ead9d2] bg-white/75 p-5">
                    <Truck className="text-[#8a675c]" size={24} />
                    <h3 className="mt-4 font-semibold text-[#2c1f1b]">
                      Delivery
                    </h3>
                    <p className="mt-2 text-sm leading-6 text-[#806a62]">
                      Cairo/Giza 80 EGP. Other areas 120 EGP.
                    </p>
                  </div>
                </div>

                <ProductCustomizationPanel
                  product={product}
                  onAddToCart={addToCart}
                />

                <div className="mt-8 rounded-[1.7rem] border border-[#ead9d2] bg-white/80 p-6">
                  <h2 className="text-xl font-semibold text-[#2c1f1b]">
                    Product details
                  </h2>
                  <p className="mt-3 leading-8 text-[#735f58]">
                    {product.description}
                  </p>
                </div>
              </div>
            </section>
          </>
        ) : null}
      </main>

      <Footer />
    </>
  );
}