import { useState } from "react";
import {
  Boxes,
  ChevronLeft,
  ChevronRight,
  Eye,
  EyeOff,
  Pencil,
  Plus,
  Search,
  Trash2
} from "lucide-react";
import {
  Link
} from "react-router-dom";
import {
  useMutation,
  useQuery,
  useQueryClient
} from "@tanstack/react-query";
import toast from "react-hot-toast";

import LoadingState from "../../components/ui/LoadingState";
import ErrorState from "../../components/ui/ErrorState";

import {
  getAdminCategories
} from "../../features/admin/adminCategoryApi";

import {
  deleteAdminProduct,
  getAdminProductErrorMessage,
  getAdminProducts,
  updateAdminProduct
} from "../../features/admin/adminProductApi";

import {
  formatPrice
} from "../../utils/cartUtils";

export default function AdminProductsPage() {
  const queryClient = useQueryClient();

  const [draftSearch, setDraftSearch] =
    useState("");

  const [search, setSearch] =
    useState("");

  const [categoryId, setCategoryId] =
    useState("all");

  const [status, setStatus] =
    useState("all");

  const [page, setPage] =
    useState(1);

  const categoriesQuery = useQuery({
    queryKey: ["admin-categories"],
    queryFn: getAdminCategories
  });

  const productsQuery = useQuery({
    queryKey: [
      "admin-products",
      search,
      categoryId,
      status,
      page
    ],

    queryFn: () =>
      getAdminProducts({
        search,
        categoryId,
        status,
        page,
        limit: 20
      })
  });

  const products =
    productsQuery.data?.products || [];

  const pagination =
    productsQuery.data?.pagination;

  const categories =
    categoriesQuery.data?.categories ||
    [];

  function refreshProducts() {
    queryClient.invalidateQueries({
      queryKey: ["admin-products"]
    });

    queryClient.invalidateQueries({
      queryKey: ["home-featured-products"]
    });

    queryClient.invalidateQueries({
      queryKey: ["shop-products"]
    });
  }

  const toggleMutation = useMutation({
    mutationFn: updateAdminProduct,

    onSuccess(response) {
      toast.success(response.message);
      refreshProducts();
    },

    onError(error) {
      toast.error(
        getAdminProductErrorMessage(error)
      );
    }
  });

  const deleteMutation = useMutation({
    mutationFn: deleteAdminProduct,

    onSuccess(response) {
      toast.success(response.message);
      refreshProducts();
    },

    onError(error) {
      toast.error(
        getAdminProductErrorMessage(error)
      );
    }
  });

  function handleSearch(event) {
    event.preventDefault();

    setSearch(draftSearch.trim());
    setPage(1);
  }

  function handleDelete(product) {
    const confirmed = window.confirm(
      `Delete "${product.name}" permanently?\n\nProducts used in orders cannot be deleted.`
    );

    if (!confirmed) {
      return;
    }

    deleteMutation.mutate(product._id);
  }

  return (
    <div>
      <div className="flex flex-col justify-between gap-5 md:flex-row md:items-end">
        <div>
          <p className="text-sm font-semibold uppercase tracking-[0.22em] text-[#a77d70]">
            Catalog management
          </p>

          <h2 className="mt-2 text-4xl font-semibold tracking-[-0.04em]">
            Products
          </h2>

          <p className="mt-3 max-w-2xl leading-7 text-[#735f58]">
            Manage product images, pricing, stock,
            personalization services, and store
            visibility.
          </p>
        </div>

        <Link
          to="/admin/products/new"
          className="inline-flex w-fit items-center gap-2 rounded-full bg-[#2c1f1b] px-6 py-3 text-sm font-semibold text-white transition hover:bg-[#4b332b]"
        >
          <Plus size={17} />
          Add product
        </Link>
      </div>

      <section className="mt-8 rounded-[1.7rem] border border-[#e5d8d2] bg-white p-5 shadow-sm">
        <form
          onSubmit={handleSearch}
          className="flex flex-col gap-3 lg:flex-row"
        >
          <div className="relative flex-1">
            <Search
              size={18}
              className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-[#9a8178]"
            />

            <input
              value={draftSearch}
              onChange={(event) =>
                setDraftSearch(
                  event.target.value
                )
              }
              placeholder="Search product name, SKU, or tag..."
              className="w-full rounded-2xl border border-[#e5d8d2] bg-[#faf7f5] py-3 pl-11 pr-4 outline-none"
            />
          </div>

          <button
            type="submit"
            className="rounded-2xl bg-[#2c1f1b] px-6 py-3 text-sm font-semibold text-white"
          >
            Search
          </button>
        </form>

        <div className="mt-4 grid gap-3 md:grid-cols-2">
          <select
            value={categoryId}
            onChange={(event) => {
              setCategoryId(
                event.target.value
              );
              setPage(1);
            }}
            className="rounded-2xl border border-[#e5d8d2] bg-white px-4 py-3 outline-none"
          >
            <option value="all">
              All categories
            </option>

            {categories.map((category) => (
              <option
                key={category._id}
                value={category._id}
              >
                {"— ".repeat(
                  category.level || 0
                )}
                {category.name}
              </option>
            ))}
          </select>

          <select
            value={status}
            onChange={(event) => {
              setStatus(event.target.value);
              setPage(1);
            }}
            className="rounded-2xl border border-[#e5d8d2] bg-white px-4 py-3 outline-none"
          >
            <option value="all">
              All products
            </option>

            <option value="active">
              Active
            </option>

            <option value="inactive">
              Inactive
            </option>
          </select>
        </div>
      </section>

      <section className="mt-6">
        {productsQuery.isLoading ? (
          <LoadingState label="Loading products..." />
        ) : null}

        {productsQuery.isError ? (
          <ErrorState message="Products could not be loaded." />
        ) : null}

        {!productsQuery.isLoading &&
        !productsQuery.isError &&
        !products.length ? (
          <div className="rounded-[1.8rem] border border-[#e5d8d2] bg-white p-12 text-center">
            <Boxes
              size={40}
              className="mx-auto text-[#a98a7f]"
            />

            <h3 className="mt-4 text-xl font-semibold">
              No matching products
            </h3>
          </div>
        ) : null}

        {!productsQuery.isLoading &&
        !productsQuery.isError &&
        products.length ? (
          <div className="grid gap-4 xl:grid-cols-2">
            {products.map((product) => (
              <article
                key={product._id}
                className="grid gap-5 rounded-[1.7rem] border border-[#e5d8d2] bg-white p-5 shadow-sm sm:grid-cols-[135px_1fr]"
              >
                <div className="aspect-square overflow-hidden rounded-2xl bg-[#f4e5df]">
                  {product.mainImage?.url ? (
                    <img
                      src={
                        product.mainImage.url
                      }
                      alt={product.name}
                      className="h-full w-full object-cover"
                    />
                  ) : (
                    <div className="flex h-full items-center justify-center px-3 text-center text-sm font-semibold text-[#8a675c]">
                      No product image
                    </div>
                  )}
                </div>

                <div className="min-w-0">
                  <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-start">
                    <div>
                      <div className="flex flex-wrap items-center gap-2">
                        <h3 className="text-lg font-semibold">
                          {product.name}
                        </h3>

                        <span
                          className={`rounded-full px-2.5 py-1 text-xs font-semibold ${
                            product.isActive
                              ? "bg-green-50 text-green-700"
                              : "bg-stone-100 text-stone-600"
                          }`}
                        >
                          {product.isActive
                            ? "Active"
                            : "Inactive"}
                        </span>
                      </div>

                      <p className="mt-2 text-sm text-[#806a62]">
                        {product.category?.name ||
                          "No category"}

                        {product.subcategory
                          ?.name
                          ? ` · ${product.subcategory.name}`
                          : ""}
                      </p>

                      {product.sku ? (
                        <p className="mt-1 text-xs text-[#9a8178]">
                          SKU: {product.sku}
                        </p>
                      ) : null}
                    </div>

                    <p className="shrink-0 text-lg font-semibold">
                      {formatPrice(
                        product.currentPrice
                      )}
                    </p>
                  </div>

                  <p className="mt-3 line-clamp-2 text-sm leading-6 text-[#735f58]">
                    {product.shortDescription ||
                      "No short description"}
                  </p>

                  <div className="mt-4 flex flex-wrap gap-2">
                    <span className="rounded-full bg-[#faf7f5] px-3 py-1.5 text-xs font-semibold text-[#735f58]">
                      Stock: {product.stock}
                    </span>

                    <span className="rounded-full bg-[#faf7f5] px-3 py-1.5 text-xs font-semibold text-[#735f58]">
                      {product.images.length} images
                    </span>

                    {product.isFeatured ? (
                      <span className="rounded-full bg-[#f4e5df] px-3 py-1.5 text-xs font-semibold text-[#7b584d]">
                        Featured
                      </span>
                    ) : null}

                    {product.isBestSeller ? (
                      <span className="rounded-full bg-[#fff4ef] px-3 py-1.5 text-xs font-semibold text-[#7b584d]">
                        Best seller
                      </span>
                    ) : null}
                  </div>

                  <div className="mt-5 flex flex-wrap gap-2 border-t border-[#eee3de] pt-4">
                    <Link
                      to={`/admin/products/${product._id}`}
                      className="inline-flex items-center gap-2 rounded-full border border-[#e5d8d2] px-4 py-2 text-sm font-semibold text-[#5a3d34]"
                    >
                      <Pencil size={15} />
                      Edit
                    </Link>

                    <button
                      type="button"
                      onClick={() =>
                        toggleMutation.mutate({
                          id: product._id,
                          payload: {
                            isActive:
                              !product.isActive
                          }
                        })
                      }
                      className="inline-flex items-center gap-2 rounded-full border border-[#e5d8d2] px-4 py-2 text-sm font-semibold text-[#5a3d34]"
                    >
                      {product.isActive ? (
                        <EyeOff size={15} />
                      ) : (
                        <Eye size={15} />
                      )}

                      {product.isActive
                        ? "Deactivate"
                        : "Activate"}
                    </button>

                    <button
                      type="button"
                      onClick={() =>
                        handleDelete(product)
                      }
                      className="ml-auto rounded-full border border-red-200 bg-red-50 p-2.5 text-red-700"
                      aria-label={`Delete ${product.name}`}
                    >
                      <Trash2 size={16} />
                    </button>
                  </div>
                </div>
              </article>
            ))}
          </div>
        ) : null}

        {pagination &&
        pagination.totalPages > 1 ? (
          <div className="mt-6 flex items-center justify-between rounded-2xl border border-[#e5d8d2] bg-white px-5 py-4">
            <p className="text-sm text-[#806a62]">
              Page {pagination.page} of{" "}
              {pagination.totalPages}
            </p>

            <div className="flex gap-2">
              <button
                type="button"
                disabled={
                  !pagination.hasPreviousPage
                }
                onClick={() =>
                  setPage((value) =>
                    Math.max(
                      value - 1,
                      1
                    )
                  )
                }
                className="rounded-full border border-[#e5d8d2] p-2.5 disabled:opacity-40"
              >
                <ChevronLeft size={18} />
              </button>

              <button
                type="button"
                disabled={
                  !pagination.hasNextPage
                }
                onClick={() =>
                  setPage((value) =>
                    value + 1
                  )
                }
                className="rounded-full border border-[#e5d8d2] p-2.5 disabled:opacity-40"
              >
                <ChevronRight size={18} />
              </button>
            </div>
          </div>
        ) : null}
      </section>
    </div>
  );
}