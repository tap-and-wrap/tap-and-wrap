import { useQuery } from "@tanstack/react-query";

import { getProducts } from "../../features/products/productApi";
import SectionHeader from "../ui/SectionHeader";
import LoadingState from "../ui/LoadingState";
import ErrorState from "../ui/ErrorState";
import ProductGrid from "../product/ProductGrid";

export default function ProductShowcase() {
  const { data, isLoading, isError } = useQuery({
    queryKey: ["home-featured-products"],
    queryFn: () =>
      getProducts({
        featured: "true",
        limit: 8
      })
  });

  const products = data?.products || [];

  return (
    <section className="mx-auto max-w-7xl px-5 py-16">
      <SectionHeader
        eyebrow="Featured gifts"
        title="A preview of the gift experience."
        text="Products support unlimited images, hover image switching, engraving eligibility, wrapping eligibility, sale prices, badges, and occasion tags."
        actionLabel="Shop all gifts"
        actionHref="/shop"
      />

      {isLoading ? <LoadingState label="Loading products..." /> : null}

      {isError ? (
        <ErrorState message="Could not load products. Make sure the backend is running." />
      ) : null}

      {!isLoading && !isError ? <ProductGrid products={products} /> : null}
    </section>
  );
}