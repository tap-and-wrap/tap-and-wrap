import ProductCard from "./ProductCard";

export default function ProductGrid({ products = [] }) {
  if (!products.length) {
    return (
      <div className="rounded-3xl border border-[#ead9d2] bg-white/75 p-10 text-center">
        <h3 className="text-xl font-semibold text-[#2c1f1b]">
          No products found yet.
        </h3>
        <p className="mt-2 text-[#735f58]">
          Products will appear here after they are added from the admin dashboard.
        </p>
      </div>
    );
  }

  return (
    <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
      {products.map((product) => (
        <ProductCard key={product._id} product={product} />
      ))}
    </div>
  );
}