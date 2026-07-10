import {
  useMemo,
  useState
} from "react";
import {
  Boxes,
  CalendarClock,
  Check,
  Gift,
  Pencil,
  Plus,
  Save,
  Search,
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
  createAdminOffer,
  deleteAdminOffer,
  getAdminOfferErrorMessage,
  getAdminOffers,
  updateAdminOffer
} from "../../features/admin/adminOfferApi";

import {
  formatPrice
} from "../../utils/cartUtils";

const inputClassName =
  "w-full rounded-2xl border border-[#e5d8d2] bg-white px-4 py-3 text-[#2c1f1b] outline-none transition focus:border-[#9a766b] focus:ring-4 focus:ring-[#ead9d2]/40";

const emptyForm = {
  name: "",
  description: "",
  type: "any_n",
  scope: "selected_products",
  productIds: [],
  categoryIds: [],
  bundleItems: [],
  requiredQuantity: 3,
  discountMode: "fixed_bundle_price",
  discountValue: "",
  freeShipping: false,
  allowMultipleApplications: true,
  maximumApplicationsPerOrder: "",
  priority: 0,
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
    "bg-red-50 text-red-700"
};

function getReferenceId(value) {
  return value?._id || value || "";
}

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

function getRewardLabel(offer) {
  const labels = {
    fixed_bundle_price:
      `Bundle price ${formatPrice(
        offer.discountValue
      )}`,

    percentage_off:
      `${offer.discountValue}% off`,

    fixed_amount_off:
      `${formatPrice(
        offer.discountValue
      )} off`,

    none:
      "No merchandise discount"
  };

  return (
    labels[offer.discountMode] ||
    offer.discountMode
  );
}

export default function AdminOffersPage() {
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

  const offersQuery = useQuery({
    queryKey: [
      "admin-offers",
      search,
      state
    ],

    queryFn: () =>
      getAdminOffers({
        search,
        state
      })
  });

  const categoriesQuery = useQuery({
    queryKey: [
      "admin-categories"
    ],

    queryFn:
      getAdminCategories
  });

  const productsQuery = useQuery({
    queryKey: [
      "admin-products",
      "offer-selector"
    ],

    queryFn: () =>
      getAdminProducts({
        page: 1,
        limit: 100,
        status: "all"
      })
  });

  const offers =
    offersQuery.data?.offers || [];

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

  function resetForm() {
    setEditingId("");
    setForm(emptyForm);
  }

  function refreshOffers() {
    queryClient.invalidateQueries({
      queryKey: [
        "admin-offers"
      ]
    });
  }

  function toggleSelection(
    field,
    id
  ) {
    setForm((current) => {
      const values =
        current[field];

      return {
        ...current,

        [field]:
          values.includes(id)
            ? values.filter(
                (value) =>
                  value !== id
              )
            : [...values, id]
      };
    });
  }

  function toggleBundleProduct(
    productId
  ) {
    setForm((current) => {
      const exists =
        current.bundleItems.some(
          (item) =>
            item.productId ===
            productId
        );

      return {
        ...current,

        bundleItems: exists
          ? current.bundleItems.filter(
              (item) =>
                item.productId !==
                productId
            )
          : [
              ...current.bundleItems,
              {
                productId,
                quantity: 1
              }
            ]
      };
    });
  }

  function updateBundleQuantity(
    productId,
    quantity
  ) {
    setForm((current) => ({
      ...current,

      bundleItems:
        current.bundleItems.map(
          (item) =>
            item.productId ===
            productId
              ? {
                  ...item,

                  quantity:
                    Math.max(
                      Number(
                        quantity
                      ) || 1,
                      1
                    )
                }
              : item
        )
    }));
  }

  const saveMutation =
    useMutation({
      mutationFn({
        id,
        payload
      }) {
        if (id) {
          return updateAdminOffer({
            id,
            payload
          });
        }

        return createAdminOffer(
          payload
        );
      },

      onSuccess(response) {
        toast.success(
          response.message
        );

        resetForm();
        refreshOffers();
      },

      onError(error) {
        toast.error(
          getAdminOfferErrorMessage(
            error
          )
        );
      }
    });

  const deleteMutation =
    useMutation({
      mutationFn:
        deleteAdminOffer,

      onSuccess(response) {
        toast.success(
          response.message
        );

        resetForm();
        refreshOffers();
      },

      onError(error) {
        toast.error(
          getAdminOfferErrorMessage(
            error
          )
        );
      }
    });

  function startEditing(offer) {
    setEditingId(offer._id);

    setForm({
      name: offer.name || "",

      description:
        offer.description || "",

      type:
        offer.type || "any_n",

      scope:
        offer.scope ||
        "selected_products",

      productIds: (
        offer.products || []
      ).map(getReferenceId),

      categoryIds: (
        offer.categories || []
      ).map(getReferenceId),

      bundleItems: (
        offer.bundleItems || []
      ).map((item) => ({
        productId:
          getReferenceId(
            item.product
          ),

        quantity:
          Number(
            item.quantity || 1
          )
      })),

      requiredQuantity:
        offer.requiredQuantity || 2,

      discountMode:
        offer.discountMode ||
        "fixed_bundle_price",

      discountValue:
        offer.discountValue ?? "",

      freeShipping:
        Boolean(
          offer.freeShipping
        ),

      allowMultipleApplications:
        offer.allowMultipleApplications !==
        false,

      maximumApplicationsPerOrder:
        offer.maximumApplicationsPerOrder ??
        "",

      priority:
        offer.priority || 0,

      startsAt:
        toDateInput(
          offer.startsAt
        ),

      endsAt:
        toDateInput(
          offer.endsAt
        ),

      isActive:
        offer.isActive !== false
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
        "Enter an offer name"
      );

      return;
    }

    if (
      form.type === "any_n" &&
      form.scope ===
        "selected_products" &&
      !form.productIds.length
    ) {
      toast.error(
        "Choose at least one eligible product"
      );

      return;
    }

    if (
      form.type === "any_n" &&
      form.scope ===
        "selected_categories" &&
      !form.categoryIds.length
    ) {
      toast.error(
        "Choose at least one eligible category"
      );

      return;
    }

    if (
      form.type ===
        "fixed_products" &&
      !form.bundleItems.length
    ) {
      toast.error(
        "Choose the products in the bundle"
      );

      return;
    }

    const totalBundleQuantity =
      form.bundleItems.reduce(
        (total, item) =>
          total +
          Number(item.quantity || 0),
        0
      );

    if (
      form.type ===
        "fixed_products" &&
      totalBundleQuantity < 2
    ) {
      toast.error(
        "The bundle must contain at least two total items"
      );

      return;
    }

    if (
      form.discountMode ===
        "none" &&
      !form.freeShipping
    ) {
      toast.error(
        "Choose a discount or enable free delivery"
      );

      return;
    }

    const discountValue =
      form.discountMode === "none"
        ? 0
        : Number(
            form.discountValue
          );

    if (
      form.discountMode !==
        "none" &&
      (!Number.isFinite(
        discountValue
      ) ||
        discountValue <= 0)
    ) {
      toast.error(
        "Enter a valid offer value"
      );

      return;
    }

    if (
      form.discountMode ===
        "percentage_off" &&
      discountValue > 100
    ) {
      toast.error(
        "Percentage discount cannot exceed 100%"
      );

      return;
    }

    saveMutation.mutate({
      id: editingId,

      payload: {
        name:
          form.name.trim(),

        description:
          form.description.trim(),

        type:
          form.type,

        scope:
          form.scope,

        productIds:
          form.type === "any_n" &&
          form.scope ===
            "selected_products"
            ? form.productIds
            : [],

        categoryIds:
          form.type === "any_n" &&
          form.scope ===
            "selected_categories"
            ? form.categoryIds
            : [],

        bundleItems:
          form.type ===
          "fixed_products"
            ? form.bundleItems.map(
                (item) => ({
                  productId:
                    item.productId,

                  quantity:
                    Number(
                      item.quantity
                    )
                })
              )
            : [],

        requiredQuantity:
          Number(
            form.requiredQuantity
          ) || 2,

        discountMode:
          form.discountMode,

        discountValue,

        freeShipping:
          form.freeShipping,

        allowMultipleApplications:
          form.allowMultipleApplications,

        maximumApplicationsPerOrder:
          form.allowMultipleApplications &&
          form.maximumApplicationsPerOrder !==
            ""
            ? Number(
                form.maximumApplicationsPerOrder
              )
            : form.allowMultipleApplications
              ? null
              : 1,

        priority:
          Number(
            form.priority
          ) || 0,

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
      }
    });
  }

  function handleDelete(offer) {
    const confirmed =
      window.confirm(
        `Delete "${offer.name}" permanently?\n\nOffers that were already used cannot be deleted.`
      );

    if (!confirmed) {
      return;
    }

    deleteMutation.mutate(
      offer._id
    );
  }

  return (
    <div>
      <div className="flex flex-col justify-between gap-5 lg:flex-row lg:items-end">
        <div>
          <p className="text-sm font-semibold uppercase tracking-[0.22em] text-[#a77d70]">
            Promotions
          </p>

          <h2 className="mt-2 text-4xl font-semibold tracking-[-0.04em]">
            Offers & bundles
          </h2>

          <p className="mt-3 max-w-2xl leading-7 text-[#735f58]">
            Build quantity offers,
            fixed product bundles,
            automatic discounts, and
            free-delivery promotions.
          </p>
        </div>

        <div className="inline-flex w-fit items-center gap-2 rounded-full border border-[#dfd1ca] bg-white px-4 py-2.5 text-sm font-semibold text-[#5a3d34]">
          <Gift size={17} />
          {offers.length} offers
        </div>
      </div>

      <section className="mt-8 grid gap-6 xl:grid-cols-[430px_1fr]">
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
                    ? "Edit offer"
                    : "New offer"}
                </h3>

                <p className="mt-1 text-sm text-[#806a62]">
                  Define its qualifying
                  products and reward.
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
                Offer name *
              </span>

              <input
                value={form.name}
                onChange={(event) =>
                  updateField(
                    "name",
                    event.target.value
                  )
                }
                placeholder="Any 3 gifts for 1000"
                className={inputClassName}
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
                placeholder="Explain the offer..."
                className={inputClassName}
              />
            </label>

            <label className="grid gap-2">
              <span className="text-sm font-semibold">
                Offer structure
              </span>

              <select
                value={form.type}
                onChange={(event) =>
                  updateField(
                    "type",
                    event.target.value
                  )
                }
                className={inputClassName}
              >
                <option value="any_n">
                  Buy any quantity
                </option>

                <option value="fixed_products">
                  Fixed products and quantities
                </option>
              </select>
            </label>

            {form.type === "any_n" ? (
              <>
                <label className="grid gap-2">
                  <span className="text-sm font-semibold">
                    Required quantity
                  </span>

                  <input
                    type="number"
                    min="2"
                    value={
                      form.requiredQuantity
                    }
                    onChange={(event) =>
                      updateField(
                        "requiredQuantity",
                        event.target.value
                      )
                    }
                    className={inputClassName}
                  />
                </label>

                <label className="grid gap-2">
                  <span className="text-sm font-semibold">
                    Eligible items
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
              </>
            ) : null}

            {form.type === "any_n" &&
            form.scope ===
              "selected_products" ? (
              <div className="rounded-3xl border border-[#e5d8d2] bg-[#faf7f5] p-4">
                <p className="text-sm font-semibold">
                  Eligible products
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

            {form.type === "any_n" &&
            form.scope ===
              "selected_categories" ? (
              <div className="rounded-3xl border border-[#e5d8d2] bg-[#faf7f5] p-4">
                <p className="text-sm font-semibold">
                  Eligible categories
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

            {form.type ===
            "fixed_products" ? (
              <div className="rounded-3xl border border-[#e5d8d2] bg-[#faf7f5] p-4">
                <p className="text-sm font-semibold">
                  Bundle products
                </p>

                <p className="mt-1 text-xs leading-5 text-[#806a62]">
                  Select every required
                  product and enter its
                  exact quantity.
                </p>

                <div className="mt-3 grid max-h-80 gap-2 overflow-y-auto pr-1">
                  {products.map(
                    (product) => {
                      const item =
                        form.bundleItems.find(
                          (entry) =>
                            entry.productId ===
                            product._id
                        );

                      return (
                        <div
                          key={
                            product._id
                          }
                          className="rounded-2xl bg-white p-3"
                        >
                          <label className="flex cursor-pointer items-center gap-3">
                            <input
                              type="checkbox"
                              checked={
                                Boolean(
                                  item
                                )
                              }
                              onChange={() =>
                                toggleBundleProduct(
                                  product._id
                                )
                              }
                              className="h-4 w-4 accent-[#5a3d34]"
                            />

                            <span className="min-w-0 flex-1">
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

                          {item ? (
                            <label className="mt-3 flex items-center justify-between gap-3 border-t border-[#eee3de] pt-3">
                              <span className="text-xs font-semibold text-[#735f58]">
                                Required quantity
                              </span>

                              <input
                                type="number"
                                min="1"
                                value={
                                  item.quantity
                                }
                                onChange={(
                                  event
                                ) =>
                                  updateBundleQuantity(
                                    product._id,
                                    event
                                      .target
                                      .value
                                  )
                                }
                                className="w-24 rounded-xl border border-[#e5d8d2] px-3 py-2 text-center outline-none"
                              />
                            </label>
                          ) : null}
                        </div>
                      );
                    }
                  )}
                </div>
              </div>
            ) : null}

            <div className="rounded-3xl bg-[#faf7f5] p-4">
              <p className="text-sm font-semibold">
                Customer reward
              </p>

              <div className="mt-4 grid gap-4">
                <label className="grid gap-2">
                  <span className="text-sm font-semibold">
                    Discount calculation
                  </span>

                  <select
                    value={
                      form.discountMode
                    }
                    onChange={(event) =>
                      updateField(
                        "discountMode",
                        event.target.value
                      )
                    }
                    className={inputClassName}
                  >
                    <option value="fixed_bundle_price">
                      Fixed bundle price
                    </option>

                    <option value="percentage_off">
                      Percentage off
                    </option>

                    <option value="fixed_amount_off">
                      Fixed amount off
                    </option>

                    <option value="none">
                      Free delivery only
                    </option>
                  </select>
                </label>

                <label className="grid gap-2">
                  <span className="text-sm font-semibold">
                    {form.discountMode ===
                    "fixed_bundle_price"
                      ? "Bundle price"
                      : form.discountMode ===
                          "percentage_off"
                        ? "Percentage"
                        : "Discount value"}
                  </span>

                  <input
                    type="number"
                    min="0"
                    max={
                      form.discountMode ===
                      "percentage_off"
                        ? 100
                        : undefined
                    }
                    disabled={
                      form.discountMode ===
                      "none"
                    }
                    value={
                      form.discountValue
                    }
                    onChange={(event) =>
                      updateField(
                        "discountValue",
                        event.target.value
                      )
                    }
                    className={inputClassName}
                  />
                </label>

                <label className="flex cursor-pointer items-center justify-between rounded-2xl bg-white p-4">
                  <span>
                    <span className="flex items-center gap-2 font-semibold">
                      <Truck size={16} />
                      Free delivery
                    </span>

                    <span className="mt-1 block text-xs text-[#806a62]">
                      Remove the delivery
                      fee when this bundle
                      applies.
                    </span>
                  </span>

                  <input
                    type="checkbox"
                    checked={
                      form.freeShipping
                    }
                    onChange={(event) =>
                      updateField(
                        "freeShipping",
                        event.target.checked
                      )
                    }
                    className="h-5 w-5 accent-[#5a3d34]"
                  />
                </label>
              </div>
            </div>

            <div className="rounded-3xl bg-[#faf7f5] p-4">
              <label className="flex cursor-pointer items-center justify-between gap-4">
                <span>
                  <span className="block font-semibold">
                    Multiple applications
                  </span>

                  <span className="mt-1 block text-xs leading-5 text-[#806a62]">
                    Example: six eligible
                    items can apply a
                    three-item offer twice.
                  </span>
                </span>

                <input
                  type="checkbox"
                  checked={
                    form.allowMultipleApplications
                  }
                  onChange={(event) =>
                    updateField(
                      "allowMultipleApplications",
                      event.target.checked
                    )
                  }
                  className="h-5 w-5 accent-[#5a3d34]"
                />
              </label>

              {form.allowMultipleApplications ? (
                <label className="mt-4 grid gap-2">
                  <span className="text-sm font-semibold">
                    Maximum applications per
                    order
                  </span>

                  <input
                    type="number"
                    min="1"
                    value={
                      form.maximumApplicationsPerOrder
                    }
                    onChange={(event) =>
                      updateField(
                        "maximumApplicationsPerOrder",
                        event.target.value
                      )
                    }
                    placeholder="Unlimited"
                    className={inputClassName}
                  />
                </label>
              ) : null}
            </div>

            <label className="grid gap-2">
              <span className="text-sm font-semibold">
                Priority
              </span>

              <input
                type="number"
                value={form.priority}
                onChange={(event) =>
                  updateField(
                    "priority",
                    event.target.value
                  )
                }
                className={inputClassName}
              />

              <span className="text-xs text-[#806a62]">
                Higher-priority offers are
                calculated first.
              </span>
            </label>

            <div className="grid gap-4 sm:grid-cols-2">
              <label className="grid gap-2">
                <span className="text-sm font-semibold">
                  Starts at
                </span>

                <input
                  type="datetime-local"
                  value={form.startsAt}
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
                  Ends at
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
                  Active offer
                </span>

                <span className="mt-1 block text-xs text-[#806a62]">
                  Inactive offers are not
                  applied to customer
                  orders.
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
                  : "Create offer"}
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
                placeholder="Search offers..."
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
            </select>
          </div>

          <div className="mt-4">
            {offersQuery.isLoading ? (
              <LoadingState label="Loading offers..." />
            ) : null}

            {offersQuery.isError ? (
              <ErrorState message="Offers could not be loaded." />
            ) : null}

            {!offersQuery.isLoading &&
            !offersQuery.isError &&
            !offers.length ? (
              <div className="rounded-[1.8rem] border border-[#e5d8d2] bg-white p-12 text-center">
                <Boxes
                  size={40}
                  className="mx-auto text-[#a98a7f]"
                />

                <h3 className="mt-4 text-xl font-semibold">
                  No matching offers
                </h3>

                <p className="mt-2 text-[#806a62]">
                  Create a bundle or change
                  the filters.
                </p>
              </div>
            ) : null}

            {!offersQuery.isLoading &&
            !offersQuery.isError &&
            offers.length ? (
              <div className="grid gap-4">
                {offers.map(
                  (offer) => (
                    <article
                      key={offer._id}
                      className="rounded-[1.7rem] border border-[#e5d8d2] bg-white p-5 shadow-sm"
                    >
                      <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-start">
                        <div>
                          <div className="flex flex-wrap items-center gap-2">
                            <span
                              className={`rounded-full px-3 py-1.5 text-xs font-semibold capitalize ${
                                stateClasses[
                                  offer.state
                                ] ||
                                stateClasses.inactive
                              }`}
                            >
                              {offer.state}
                            </span>

                            <span className="rounded-full bg-[#faf7f5] px-3 py-1.5 text-xs font-semibold text-[#735f58]">
                              Priority{" "}
                              {offer.priority}
                            </span>
                          </div>

                          <h3 className="mt-4 text-xl font-semibold">
                            {offer.name}
                          </h3>

                          {offer.description ? (
                            <p className="mt-2 leading-6 text-[#735f58]">
                              {
                                offer.description
                              }
                            </p>
                          ) : null}
                        </div>

                        <div className="flex shrink-0 gap-2">
                          <button
                            type="button"
                            onClick={() =>
                              startEditing(
                                offer
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
                                offer
                              )
                            }
                            disabled={
                              deleteMutation.isPending
                            }
                            className="rounded-full border border-red-200 bg-red-50 p-2.5 text-red-700 disabled:opacity-50"
                          >
                            <Trash2
                              size={16}
                            />
                          </button>
                        </div>
                      </div>

                      <div className="mt-5 grid gap-3 border-t border-[#eee3de] pt-5 md:grid-cols-3">
                        <div className="rounded-2xl bg-[#faf7f5] p-4">
                          <p className="text-xs font-semibold uppercase tracking-[0.12em] text-[#806a62]">
                            Requirement
                          </p>

                          <p className="mt-2 font-semibold">
                            {offer.type ===
                            "any_n"
                              ? `Any ${offer.requiredQuantity} eligible items`
                              : `${offer.requiredQuantity} fixed items`}
                          </p>
                        </div>

                        <div className="rounded-2xl bg-[#faf7f5] p-4">
                          <p className="text-xs font-semibold uppercase tracking-[0.12em] text-[#806a62]">
                            Reward
                          </p>

                          <p className="mt-2 font-semibold">
                            {getRewardLabel(
                              offer
                            )}
                          </p>
                        </div>

                        <div className="rounded-2xl bg-[#faf7f5] p-4">
                          <p className="text-xs font-semibold uppercase tracking-[0.12em] text-[#806a62]">
                            Applications
                          </p>

                          <p className="mt-2 font-semibold">
                            {offer.allowMultipleApplications
                              ? offer.maximumApplicationsPerOrder
                                ? `Up to ${offer.maximumApplicationsPerOrder}`
                                : "Unlimited"
                              : "Once per order"}
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
                            offer.startsAt
                          )}
                        </span>

                        <span className="inline-flex items-center gap-2">
                          <CalendarClock
                            size={15}
                          />

                          Ends:{" "}
                          {formatDate(
                            offer.endsAt
                          )}
                        </span>

                        {offer.freeShipping ? (
                          <span className="inline-flex items-center gap-2 font-semibold text-[#5a3d34]">
                            <Truck
                              size={15}
                            />
                            Free delivery
                          </span>
                        ) : null}

                        {offer.isActive ? (
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