import { useParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";

import Header from "../components/layout/Header";
import Footer from "../components/layout/Footer";
import ProductGrid from "../components/product/ProductGrid";
import SectionHeader from "../components/ui/SectionHeader";
import LoadingState from "../components/ui/LoadingState";
import ErrorState from "../components/ui/ErrorState";
import { getCategoryBySlug } from "../features/categories/categoryApi";
import { getProducts } from "../features/products/productApi";

export default function CategoryPage() {
  const { slug } = useParams();

  const categoryQuery = useQuery({
    queryKey: ["category", slug],
    queryFn: () => getCategoryBySlug(slug),
    enabled: Boolean(slug)
  });

  const productsQuery = useQuery({
    queryKey: ["category-products", slug],
    queryFn: () =>
      getProducts({
        category: slug,
        limit: 24
      }),
    enabled: Boolean(slug)
  });

  const category = categoryQuery.data?.category;
  const products = productsQuery.data?.products || [];

  return (
    <>
      <Header />
      <main className="mx-auto max-w-7xl px-5 py-14">
        {categoryQuery.isLoading ? (
          <LoadingState label="Loading category..." />
        ) : null}

        {categoryQuery.isError ? (
          <ErrorState message="Could not load this category." />
        ) : null}

        {category ? (
          <SectionHeader
            eyebrow="Category"
            title={category.name}
            text={category.description || "Explore Tap & Wrap products in this category."}
            actionLabel="Back to shop"
            actionHref="/shop"
          />
        ) : null}

        {productsQuery.isLoading ? (
          <LoadingState label="Loading category products..." />
        ) : null}

        {productsQuery.isError ? (
          <ErrorState message="Could not load products for this category." />
        ) : null}

        {!productsQuery.isLoading && !productsQuery.isError ? (
          <ProductGrid products={products} />
        ) : null}
      </main>
      <Footer />
    </>
  );
}