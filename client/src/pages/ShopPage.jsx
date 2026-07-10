import { useQuery } from "@tanstack/react-query";

import Header from "../components/layout/Header";
import Footer from "../components/layout/Footer";
import ProductGrid from "../components/product/ProductGrid";
import SectionHeader from "../components/ui/SectionHeader";
import LoadingState from "../components/ui/LoadingState";
import ErrorState from "../components/ui/ErrorState";
import { getProducts } from "../features/products/productApi";

export default function ShopPage() {
  const { data, isLoading, isError } = useQuery({
    queryKey: ["shop-products"],
    queryFn: () =>
      getProducts({
        limit: 24
      })
  });

  const products = data?.products || [];

  return (
    <>
      <Header />
      <main className="mx-auto max-w-7xl px-5 py-14">
        <SectionHeader
          eyebrow="Shop gifts"
          title="All Tap & Wrap products."
          text="This page will later include filters by category, occasion, price, engraving, wrapping, flash sale, and best sellers."
        />

        {isLoading ? <LoadingState label="Loading shop products..." /> : null}

        {isError ? (
          <ErrorState message="Could not load products. Make sure the backend is running." />
        ) : null}

        {!isLoading && !isError ? <ProductGrid products={products} /> : null}
      </main>
      <Footer />
    </>
  );
}