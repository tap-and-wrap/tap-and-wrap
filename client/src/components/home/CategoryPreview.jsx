import { Gift } from "lucide-react";
import { useQuery } from "@tanstack/react-query";

import { getHomeCategories } from "../../features/categories/categoryApi";
import SectionHeader from "../ui/SectionHeader";
import LoadingState from "../ui/LoadingState";
import ErrorState from "../ui/ErrorState";

export default function CategoryPreview() {
  const {
    data,
    isLoading,
    isError
  } = useQuery({
    queryKey: ["home-categories"],
    queryFn: getHomeCategories
  });

  const categories = data?.categories || [];

  return (
    <section id="shop" className="mx-auto max-w-7xl px-5 py-16">
      <SectionHeader
        eyebrow="Shop by category"
        title="Find the right gift faster."
        text="Tap & Wrap categories are managed from the database, so the admin dashboard can control what appears here later."
        actionLabel="View all categories"
      />

      {isLoading ? <LoadingState label="Loading categories..." /> : null}

      {isError ? (
        <ErrorState message="Could not load categories. Make sure the backend is running." />
      ) : null}

      {!isLoading && !isError ? (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {categories.map((category) => (
            <a
              key={category._id}
              href={`/categories/${category.slug}`}
              className="group rounded-3xl border border-[#ead9d2] bg-white/76 p-6 shadow-sm transition duration-300 hover:-translate-y-1 hover:shadow-xl hover:shadow-[#4b332b]/10"
            >
              <div className="mb-10 flex h-24 items-center justify-center rounded-2xl bg-gradient-to-br from-[#f4e5df] to-[#fffaf7] text-[#8a675c] transition group-hover:scale-[1.02]">
                <Gift size={32} />
              </div>

              <h3 className="text-xl font-semibold text-[#2c1f1b]">
                {category.name}
              </h3>

              <p className="mt-2 line-clamp-3 leading-6 text-[#806a62]">
                {category.description || "Explore products and gift ideas."}
              </p>

              <div className="mt-5 flex flex-wrap gap-2">
                {category.serviceDefaults?.engraving ? (
                  <span className="rounded-full bg-[#f4e5df] px-3 py-1 text-xs font-semibold text-[#7b584d]">
                    Engraving
                  </span>
                ) : null}

                {category.serviceDefaults?.wrapping ? (
                  <span className="rounded-full bg-[#fff4ef] px-3 py-1 text-xs font-semibold text-[#7b584d]">
                    Wrapping
                  </span>
                ) : null}

                {category.serviceDefaults?.photoPrinting ? (
                  <span className="rounded-full bg-[#f4e5df] px-3 py-1 text-xs font-semibold text-[#7b584d]">
                    Printing
                  </span>
                ) : null}
              </div>
            </a>
          ))}
        </div>
      ) : null}
    </section>
  );
}