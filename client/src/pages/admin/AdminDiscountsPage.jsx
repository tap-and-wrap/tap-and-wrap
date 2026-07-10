import {
  useMemo,
  useState
} from "react";
import {
  BadgePercent,
  CalendarClock,
  Check,
  Copy,
  Pencil,
  Plus,
  Save,
  Search,
  Tag,
  Trash2,
  Truck,
  X
} from "lucide-react";
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
  getAdminProducts
} from "../../features/admin/adminProductApi";

import {
  createAdminDiscount,
  deleteAdminDiscount,
  getAdminDiscountErrorMessage,
  getAdminDiscounts,
  updateAdminDiscount
} from "../../features/admin/adminDiscountApi";

import {
  formatPrice
} from "../../utils/cartUtils";

const inputClassName =
  "w-full rounded-2xl border border-[#e5d8d2] bg-white px-4 py-3 text-[#2c1f1b] outline-none transition focus:border-[#9a766b] focus:ring-4 focus:ring-[#ead9d2]/40";

const emptyForm = {
  name: "",
  code: "",
  description: "",
  type: "percentage",
  value: 10,
  minimumSubtotal: 0,
  maximumDiscount: "",
  usageLimit: "",
  usageLimitPerCustomer: "",
  scope: "all_products",
  productIds: [],
  categoryIds: [],
  startsAt: "",
  endsAt: "",
  isActive: true
};

const stateClasses = {
  active:
    "bg-green-50 text-green-700",
  inactive:
    "bg-stone-100 text-stone-600",
  scheduled:
    "bg-blue-50 text-blue-700",
  expired:
    "bg-red-50 text-red-700",
  exhausted:
    "bg-amber-50 text-amber-800"
};

function toDateInput(value) {
  if (!value) {
    return "";
  }

  const date = new Date(value);

  const localDate = new Date(
    date.getTime() -
      date.getTimezoneOffset() *
        60000
  );

  return localDate
    .toISOString()
    .slice(0, 16);
}

function toApiDate(value) {
  if (!value) {
    return null;
  }

  return new Date(
    value
  ).toISOString();
}

function getReferenceId(value) {
  return value?._id || value || "";
}

function formatDate(value) {
  if (!value) {
    return "No limit";
  }

  return new Intl.DateTimeFormat(
    "en-EG",
    {
      dateStyle: "medium",
      timeStyle: "short"
    }
  ).format(new Date(value));
}

function getTypeLabel(type) {
  const labels = {
    percentage: "Percentage",
    fixed: "Fixed amount",
    free_shipping:
      "Free delivery"
  };

  return labels[type] || type;
}

function getScopeLabel(scope) {
  const labels = {
    all_products:
      "All products",
    selected_products:
      "Selected products",
    selected_categories:
      "Selected categories"
  };

  return labels[scope] || scope;
}

export default function AdminDiscountsPage() {
  const queryClient =
    useQueryClient();

  const [search, setSearch] =
    useState("");

  const [state, setState] =
    useState("all");

  const [editingId, setEditingId] =
    useState("");

  const [form, setForm] =
    useState(emptyForm);

  const discountsQuery = useQuery({
    queryKey: [
      "admin-discounts",
      search,
      state
    ],

    queryFn: () =>
      getAdminDiscounts({
        search,
        state
      })
  });

  const categoriesQuery = useQuery({
    queryKey: [
      "admin-categories"
    ],
    queryFn: getAdminCategories
  });

  const productsQuery = useQuery({
    queryKey: [
      "admin-products",
      "discount-selector"
    ],

    queryFn: () =>
      getAdminProducts({
        page: 1,
        limit: 100,
        status: "all"
      })
  });

  const discounts =
    discountsQuery.data
      ?.discounts || [];

  const categories =
    categoriesQuery.data
      ?.categories || [];

  const products =
    productsQuery.data
      ?.products || [];

  const activeCategories =
    useMemo(
      () =>
        categories.filter(
          (category) =>
            category.isActive
        ),
      [categories]
    );

  function updateField(
    field,
    value
  ) {
    setForm((current) => ({
      ...current,
      [field]: value
    }));
  }

  function toggleSelection(
    field,
    id
  ) {
    setForm((current) => {
      const currentValues =
        current[field];

      const selected =
        currentValues.includes(id);

      return {
        ...current,

        [field]: selected
          ? currentValues.filter(
              (value) =>
                value !== id
            )
          : [
              ...currentValues,
              id
            ]
      };
    });
  }

  function resetForm() {
    setEditingId("");
    setForm(emptyForm);
  }

  function refreshDiscounts() {
    queryClient.invalidateQueries({
      queryKey: [
        "admin-discounts"
      ]
    });
  }

  const saveMutation =
    useMutation({
      mutationFn({
        id,
        payload
      }) {
        if (id) {
          return updateAdminDiscount(
            {
              id,
              payload
            }
          );
        }

        return createAdminDiscount(
          payload
        );
      },

      onSuccess(response) {
        toast.success(
          response.message
        );

        resetForm();
        refreshDiscounts();
      },

      onError(error) {
        toast.error(
          getAdminDiscountErrorMessage(
            error
          )
        );
      }
    });

  const deleteMutation =
    useMutation({
      mutationFn:
        deleteAdminDiscount,

      onSuccess(response) {
        toast.success(
          response.message
        );

        resetForm();
        refreshDiscounts();
      },

      onError(error) {
        toast.error(
          getAdminDiscountErrorMessage(
            error
          )
        );
      }
    });

  function startEditing(
    discount
  ) {
    setEditingId(discount._id);

    setForm({
      name:
        discount.name || "",

      code:
        discount.code || "",

      description:
        discount.description ||
        "",

      type:
        discount.type ||
        "percentage",

      value:
        discount.value ?? 0,

      minimumSubtotal:
        discount.minimumSubtotal ??
        0,

      maximumDiscount:
        discount.maximumDiscount ??
        "",

      usageLimit:
        discount.usageLimit ?? "",

      usageLimitPerCustomer:
        discount.usageLimitPerCustomer ??
        "",

      scope:
        discount.scope ||
        "all_products",

      productIds: (
        discount.products || []
      ).map(getReferenceId),

      categoryIds: (
        discount.categories || []
      ).map(getReferenceId),

      startsAt:
        toDateInput(
          discount.startsAt
        ),

      endsAt:
        toDateInput(
          discount.endsAt
        ),

      isActive:
        discount.isActive !== false
    });

    window.scrollTo({
      top: 0,
      behavior: "smooth"
    });
  }

  function handleSubmit(event) {
    event.preventDefault();

    if (!form.name.trim()) {
      toast.error(
        "Enter a discount name"
      );

      return;
    }

    if (!form.code.trim()) {
      toast.error(
        "Enter a discount code"
      );

      return;
    }

    if (
      form.scope ===
        "selected_products" &&
      !form.productIds.length
    ) {
      toast.error(
        "Choose at least one product"
      );

      return;
    }

    if (
      form.scope ===
        "selected_categories" &&
      !form.categoryIds.length
    ) {
      toast.error(
        "Choose at least one category"
      );

      return;
    }

    const payload = {
      name: form.name.trim(),

      code: form.code
        .trim()
        .toUpperCase()
        .replace(/\s+/g, ""),

      description:
        form.description.trim(),

      type: form.type,

      value:
        form.type ===
        "free_shipping"
          ? 0
          : Number(form.value) ||
            0,

      minimumSubtotal:
        Number(
          form.minimumSubtotal
        ) || 0,

      maximumDiscount:
        form.maximumDiscount ===
        ""
          ? null
          : Number(
              form.maximumDiscount
            ),

      usageLimit:
        form.usageLimit === ""
          ? null
          : Number(
              form.usageLimit
            ),

      usageLimitPerCustomer:
        form.usageLimitPerCustomer ===
        ""
          ? null
          : Number(
              form.usageLimitPerCustomer
            ),

      scope: form.scope,

      productIds:
        form.scope ===
        "selected_products"
          ? form.productIds
          : [],

      categoryIds:
        form.scope ===
        "selected_categories"
          ? form.categoryIds
          : [],

      startsAt:
        toApiDate(
          form.startsAt
        ),

      endsAt:
        toApiDate(
          form.endsAt
        ),

      isActive:
        form.isActive
    };

    saveMutation.mutate({
      id: editingId,
      payload
    });
  }

  function handleDelete(
    discount
  ) {
    const confirmed =
      window.confirm(
        `Delete "${discount.code}" permanently?\n\nCodes that were already used cannot be deleted.`
      );

    if (!confirmed) {
      return;
    }

    deleteMutation.mutate(
      discount._id
    );
  }

  async function copyCode(
    code
  ) {
    try {
      await navigator.clipboard.writeText(
        code
      );

      toast.success(
        "Discount code copied"
      );
    } catch {
      toast.error(
        "Could not copy the code"
      );
    }
  }

  return (
    <div>
      <div className="flex flex-col justify-between gap-5 lg:flex-row lg:items-end">
        <div>
          <p className="text-sm font-semibold uppercase tracking-[0.22em] text-[#a77d70]">
            Promotions
          </p>

          <h2 className="mt-2 text-4xl font-semibold tracking-[-0.04em]">
            Discount codes
          </h2>

          <p className="mt-3 max-w-2xl leading-7 text-[#735f58]">
            Create controlled discounts with
            usage limits, dates, minimum
            spending rules, and product or
            category restrictions.
          </p>
        </div>

        <div className="inline-flex w-fit items-center gap-2 rounded-full border border-[#dfd1ca] bg-white px-4 py-2.5 text-sm font-semibold text-[#5a3d34]">
          <Tag size={17} />
          {discounts.length} codes
        </div>
      </div>

      <section className="mt-8 grid gap-6 xl:grid-cols-[410px_1fr]">
        <form
          onSubmit={handleSubmit}
          className="h-fit rounded-[1.8rem] border border-[#e5d8d2] bg-white p-6 shadow-sm xl:sticky xl:top-28"
        >
          <div className="flex items-start justify-between gap-4">
            <div className="flex items-center gap-3">
              <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-[#f4e5df] text-[#7b584d]">
                {editingId ? (
                  <Pencil size={20} />
                ) : (
                  <Plus size={20} />
                )}
              </div>

              <div>
                <h3 className="text-xl font-semibold">
                  {editingId
                    ? "Edit discount"
                    : "New discount"}
                </h3>

                <p className="mt-1 text-sm text-[#806a62]">
                  Configure the code and its
                  restrictions.
                </p>
              </div>
            </div>

            {editingId ? (
              <button
                type="button"
                onClick={resetForm}
                className="rounded-full border border-[#e5d8d2] p-2 text-[#735f58]"
                aria-label="Cancel editing"
              >
                <X size={17} />
              </button>
            ) : null}
          </div>

          <div className="mt-6 grid gap-4">
            <label className="grid gap-2">
              <span className="text-sm font-semibold">
                Internal name *
              </span>

              <input
                value={form.name}
                onChange={(event) =>
                  updateField(
                    "name",
                    event.target.value
                  )
                }
                placeholder="Summer campaign"
                className={inputClassName}
              />
            </label>

            <label className="grid gap-2">
              <span className="text-sm font-semibold">
                Customer code *
              </span>

              <input
                value={form.code}
                onChange={(event) =>
                  updateField(
                    "code",
                    event.target.value
                      .toUpperCase()
                      .replace(
                        /\s+/g,
                        ""
                      )
                  )
                }
                placeholder="SUMMER20"
                className={`${inputClassName} font-semibold uppercase tracking-[0.12em]`}
              />
            </label>

            <label className="grid gap-2">
              <span className="text-sm font-semibold">
                Description
              </span>

              <textarea
                value={
                  form.description
                }
                onChange={(event) =>
                  updateField(
                    "description",
                    event.target.value
                  )
                }
                rows={3}
                placeholder="Private description for the admin..."
                className={inputClassName}
              />
            </label>

            <div className="grid gap-4 sm:grid-cols-2">
              <label className="grid gap-2">
                <span className="text-sm font-semibold">
                  Discount type
                </span>

                <select
                  value={form.type}
                  onChange={(event) => {
                    const nextType =
                      event.target.value;

                    updateField(
                      "type",
                      nextType
                    );

                    if (
                      nextType ===
                      "free_shipping"
                    ) {
                      updateField(
                        "value",
                        0
                      );

                      updateField(
                        "maximumDiscount",
                        ""
                      );
                    }
                  }}
                  className={inputClassName}
                >
                  <option value="percentage">
                    Percentage
                  </option>

                  <option value="fixed">
                    Fixed amount
                  </option>

                  <option value="free_shipping">
                    Free delivery
                  </option>
                </select>
              </label>

              <label className="grid gap-2">
                <span className="text-sm font-semibold">
                  {form.type ===
                  "percentage"
                    ? "Percentage"
                    : "Value"}
                </span>

                <input
                  type="number"
                  min="0"
                  max={
                    form.type ===
                    "percentage"
                      ? 100
                      : undefined
                  }
                  value={form.value}
                  disabled={
                    form.type ===
                    "free_shipping"
                  }
                  onChange={(event) =>
                    updateField(
                      "value",
                      event.target.value
                    )
                  }
                  className={inputClassName}
                />
              </label>
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <label className="grid gap-2">
                <span className="text-sm font-semibold">
                  Minimum subtotal
                </span>

                <input
                  type="number"
                  min="0"
                  value={
                    form.minimumSubtotal
                  }
                  onChange={(event) =>
                    updateField(
                      "minimumSubtotal",
                      event.target.value
                    )
                  }
                  className={inputClassName}
                />
              </label>

              <label className="grid gap-2">
                <span className="text-sm font-semibold">
                  Maximum discount
                </span>

                <input
                  type="number"
                  min="0"
                  value={
                    form.maximumDiscount
                  }
                  disabled={
                    form.type ===
                    "free_shipping"
                  }
                  onChange={(event) =>
                    updateField(
                      "maximumDiscount",
                      event.target.value
                    )
                  }
                  placeholder="No cap"
                  className={inputClassName}
                />
              </label>
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <label className="grid gap-2">
                <span className="text-sm font-semibold">
                  Total usage limit
                </span>

                <input
                  type="number"
                  min="1"
                  value={
                    form.usageLimit
                  }
                  onChange={(event) =>
                    updateField(
                      "usageLimit",
                      event.target.value
                    )
                  }
                  placeholder="Unlimited"
                  className={inputClassName}
                />
              </label>

              <label className="grid gap-2">
                <span className="text-sm font-semibold">
                  Per customer
                </span>

                <input
                  type="number"
                  min="1"
                  value={
                    form.usageLimitPerCustomer
                  }
                  onChange={(event) =>
                    updateField(
                      "usageLimitPerCustomer",
                      event.target.value
                    )
                  }
                  placeholder="Unlimited"
                  className={inputClassName}
                />
              </label>
            </div>

            <label className="grid gap-2">
              <span className="text-sm font-semibold">
                Applies to
              </span>

              <select
                value={form.scope}
                onChange={(event) =>
                  updateField(
                    "scope",
                    event.target.value
                  )
                }
                className={inputClassName}
              >
                <option value="all_products">
                  All products
                </option>

                <option value="selected_products">
                  Selected products
                </option>

                <option value="selected_categories">
                  Selected categories
                </option>
              </select>
            </label>

            {form.scope ===
            "selected_products" ? (
              <div className="rounded-3xl border border-[#e5d8d2] bg-[#faf7f5] p-4">
                <p className="text-sm font-semibold">
                  Choose products
                </p>

                <div className="mt-3 grid max-h-64 gap-2 overflow-y-auto pr-1">
                  {products.map(
                    (product) => (
                      <label
                        key={
                          product._id
                        }
                        className="flex cursor-pointer items-center gap-3 rounded-2xl bg-white p-3"
                      >
                        <input
                          type="checkbox"
                          checked={form.productIds.includes(
                            product._id
                          )}
                          onChange={() =>
                            toggleSelection(
                              "productIds",
                              product._id
                            )
                          }
                          className="h-4 w-4 accent-[#5a3d34]"
                        />

                        <span className="min-w-0">
                          <span className="block truncate text-sm font-semibold">
                            {product.name}
                          </span>

                          <span className="mt-1 block text-xs text-[#806a62]">
                            {formatPrice(
                              product.currentPrice
                            )}
                          </span>
                        </span>
                      </label>
                    )
                  )}
                </div>
              </div>
            ) : null}

            {form.scope ===
            "selected_categories" ? (
              <div className="rounded-3xl border border-[#e5d8d2] bg-[#faf7f5] p-4">
                <p className="text-sm font-semibold">
                  Choose categories
                </p>

                <div className="mt-3 grid max-h-64 gap-2 overflow-y-auto pr-1">
                  {activeCategories.map(
                    (category) => (
                      <label
                        key={
                          category._id
                        }
                        className="flex cursor-pointer items-center gap-3 rounded-2xl bg-white p-3"
                        style={{
                          marginLeft: `${
                            (category.level ||
                              0) * 12
                          }px`
                        }}
                      >
                        <input
                          type="checkbox"
                          checked={form.categoryIds.includes(
                            category._id
                          )}
                          onChange={() =>
                            toggleSelection(
                              "categoryIds",
                              category._id
                            )
                          }
                          className="h-4 w-4 accent-[#5a3d34]"
                        />

                        <span className="text-sm font-semibold">
                          {category.level >
                          0
                            ? "↳ "
                            : ""}
                          {category.name}
                        </span>
                      </label>
                    )
                  )}
                </div>
              </div>
            ) : null}

            <div className="grid gap-4 sm:grid-cols-2">
              <label className="grid gap-2">
                <span className="text-sm font-semibold">
                  Starts at
                </span>

                <input
                  type="datetime-local"
                  value={
                    form.startsAt
                  }
                  onChange={(event) =>
                    updateField(
                      "startsAt",
                      event.target.value
                    )
                  }
                  className={inputClassName}
                />
              </label>

              <label className="grid gap-2">
                <span className="text-sm font-semibold">
                  Expires at
                </span>

                <input
                  type="datetime-local"
                  value={form.endsAt}
                  onChange={(event) =>
                    updateField(
                      "endsAt",
                      event.target.value
                    )
                  }
                  className={inputClassName}
                />
              </label>
            </div>

            <label className="flex cursor-pointer items-center justify-between rounded-3xl bg-[#faf7f5] p-4">
              <span>
                <span className="block font-semibold">
                  Active discount
                </span>

                <span className="mt-1 block text-xs text-[#806a62]">
                  Inactive codes cannot be
                  used at checkout.
                </span>
              </span>

              <input
                type="checkbox"
                checked={
                  form.isActive
                }
                onChange={(event) =>
                  updateField(
                    "isActive",
                    event.target.checked
                  )
                }
                className="h-5 w-5 accent-[#5a3d34]"
              />
            </label>

            <button
              type="submit"
              disabled={
                saveMutation.isPending
              }
              className="flex items-center justify-center gap-2 rounded-full bg-[#2c1f1b] px-6 py-3.5 text-sm font-semibold text-white transition hover:bg-[#4b332b] disabled:opacity-60"
            >
              <Save size={17} />

              {saveMutation.isPending
                ? "Saving..."
                : editingId
                  ? "Save changes"
                  : "Create code"}
            </button>
          </div>
        </form>

        <div>
          <div className="grid gap-3 sm:grid-cols-[1fr_210px]">
            <div className="relative">
              <Search
                size={18}
                className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-[#9a8178]"
              />

              <input
                value={search}
                onChange={(event) =>
                  setSearch(
                    event.target.value
                  )
                }
                placeholder="Search code or campaign..."
                className="w-full rounded-2xl border border-[#e5d8d2] bg-white py-3.5 pl-11 pr-4 outline-none"
              />
            </div>

            <select
              value={state}
              onChange={(event) =>
                setState(
                  event.target.value
                )
              }
              className={inputClassName}
            >
              <option value="all">
                All states
              </option>

              <option value="active">
                Active
              </option>

              <option value="scheduled">
                Scheduled
              </option>

              <option value="inactive">
                Inactive
              </option>

              <option value="expired">
                Expired
              </option>

              <option value="exhausted">
                Exhausted
              </option>
            </select>
          </div>

          <div className="mt-4">
            {discountsQuery.isLoading ? (
              <LoadingState label="Loading discount codes..." />
            ) : null}

            {discountsQuery.isError ? (
              <ErrorState message="Discount codes could not be loaded." />
            ) : null}

            {!discountsQuery.isLoading &&
            !discountsQuery.isError &&
            !discounts.length ? (
              <div className="rounded-[1.8rem] border border-[#e5d8d2] bg-white p-12 text-center">
                <BadgePercent
                  size={40}
                  className="mx-auto text-[#a98a7f]"
                />

                <h3 className="mt-4 text-xl font-semibold">
                  No matching codes
                </h3>

                <p className="mt-2 text-[#806a62]">
                  Create a new discount or
                  change the filters.
                </p>
              </div>
            ) : null}

            {!discountsQuery.isLoading &&
            !discountsQuery.isError &&
            discounts.length ? (
              <div className="grid gap-4">
                {discounts.map(
                  (discount) => (
                    <article
                      key={
                        discount._id
                      }
                      className="rounded-[1.7rem] border border-[#e5d8d2] bg-white p-5 shadow-sm"
                    >
                      <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-start">
                        <div className="min-w-0">
                          <div className="flex flex-wrap items-center gap-2">
                            <button
                              type="button"
                              onClick={() =>
                                copyCode(
                                  discount.code
                                )
                              }
                              className="inline-flex items-center gap-2 rounded-full bg-[#2c1f1b] px-4 py-2 font-semibold tracking-[0.12em] text-white"
                            >
                              {
                                discount.code
                              }

                              <Copy
                                size={14}
                              />
                            </button>

                            <span
                              className={`rounded-full px-3 py-1.5 text-xs font-semibold capitalize ${
                                stateClasses[
                                  discount
                                    .state
                                ] ||
                                stateClasses.inactive
                              }`}
                            >
                              {
                                discount.state
                              }
                            </span>
                          </div>

                          <h3 className="mt-4 text-xl font-semibold">
                            {
                              discount.name
                            }
                          </h3>

                          {discount.description ? (
                            <p className="mt-2 leading-6 text-[#735f58]">
                              {
                                discount.description
                              }
                            </p>
                          ) : null}
                        </div>

                        <div className="flex shrink-0 gap-2">
                          <button
                            type="button"
                            onClick={() =>
                              startEditing(
                                discount
                              )
                            }
                            className="inline-flex items-center gap-2 rounded-full border border-[#e5d8d2] px-4 py-2 text-sm font-semibold text-[#5a3d34]"
                          >
                            <Pencil
                              size={15}
                            />
                            Edit
                          </button>

                          <button
                            type="button"
                            onClick={() =>
                              handleDelete(
                                discount
                              )
                            }
                            disabled={
                              deleteMutation.isPending
                            }
                            className="rounded-full border border-red-200 bg-red-50 p-2.5 text-red-700 disabled:opacity-50"
                            aria-label={`Delete ${discount.code}`}
                          >
                            <Trash2
                              size={16}
                            />
                          </button>
                        </div>
                      </div>

                      <div className="mt-5 grid gap-3 border-t border-[#eee3de] pt-5 sm:grid-cols-2 xl:grid-cols-4">
                        <div className="rounded-2xl bg-[#faf7f5] p-4">
                          <p className="text-xs font-semibold uppercase tracking-[0.12em] text-[#806a62]">
                            Benefit
                          </p>

                          <p className="mt-2 font-semibold">
                            {discount.type ===
                            "percentage"
                              ? `${discount.value}% off`
                              : discount.type ===
                                  "fixed"
                                ? `${formatPrice(
                                    discount.value
                                  )} off`
                                : "Free delivery"}
                          </p>
                        </div>

                        <div className="rounded-2xl bg-[#faf7f5] p-4">
                          <p className="text-xs font-semibold uppercase tracking-[0.12em] text-[#806a62]">
                            Applies to
                          </p>

                          <p className="mt-2 font-semibold">
                            {getScopeLabel(
                              discount.scope
                            )}
                          </p>
                        </div>

                        <div className="rounded-2xl bg-[#faf7f5] p-4">
                          <p className="text-xs font-semibold uppercase tracking-[0.12em] text-[#806a62]">
                            Usage
                          </p>

                          <p className="mt-2 font-semibold">
                            {
                              discount.usedCount
                            }
                            /
                            {discount.usageLimit ??
                              "∞"}
                          </p>
                        </div>

                        <div className="rounded-2xl bg-[#faf7f5] p-4">
                          <p className="text-xs font-semibold uppercase tracking-[0.12em] text-[#806a62]">
                            Minimum
                          </p>

                          <p className="mt-2 font-semibold">
                            {formatPrice(
                              discount.minimumSubtotal ||
                                0
                            )}
                          </p>
                        </div>
                      </div>

                      <div className="mt-4 flex flex-wrap gap-3 text-sm text-[#806a62]">
                        <span className="inline-flex items-center gap-2">
                          <CalendarClock
                            size={15}
                          />

                          Starts:{" "}
                          {formatDate(
                            discount.startsAt
                          )}
                        </span>

                        <span className="inline-flex items-center gap-2">
                          <CalendarClock
                            size={15}
                          />

                          Ends:{" "}
                          {formatDate(
                            discount.endsAt
                          )}
                        </span>

                        {discount.type ===
                        "free_shipping" ? (
                          <span className="inline-flex items-center gap-2 font-semibold text-[#5a3d34]">
                            <Truck
                              size={15}
                            />
                            Delivery promotion
                          </span>
                        ) : null}

                        {discount.isActive ? (
                          <span className="inline-flex items-center gap-1 font-semibold text-green-700">
                            <Check
                              size={14}
                            />
                            Enabled
                          </span>
                        ) : null}
                      </div>
                    </article>
                  )
                )}
              </div>
            ) : null}
          </div>
        </div>
      </section>
    </div>
  );
}