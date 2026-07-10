import {
  useEffect,
  useMemo,
  useState
} from "react";
import {
  ArrowLeft,
  LoaderCircle,
  Save,
  Sparkles
} from "lucide-react";
import {
  Link,
  useNavigate,
  useParams
} from "react-router-dom";
import {
  useMutation,
  useQuery,
  useQueryClient
} from "@tanstack/react-query";
import toast from "react-hot-toast";

import ProductImageManager from "../../components/admin/ProductImageManager";
import LoadingState from "../../components/ui/LoadingState";
import ErrorState from "../../components/ui/ErrorState";

import {
  getAdminCategories
} from "../../features/admin/adminCategoryApi";

import {
  createAdminProduct,
  getAdminProduct,
  getAdminProductErrorMessage,
  updateAdminProduct
} from "../../features/admin/adminProductApi";

const inputClassName =
  "w-full rounded-2xl border border-[#e5d8d2] bg-white px-4 py-3 text-[#2c1f1b] outline-none transition focus:border-[#9a766b] focus:ring-4 focus:ring-[#ead9d2]/40";

const emptyForm = {
  name: "",
  slug: "",
  sku: "",
  shortDescription: "",
  description: "",
  price: "",
  salePrice: "",
  stock: 0,
  categoryId: "",
  subcategoryId: "",
  images: [],

  serviceEligibility: {
    engraving: false,
    wrapping: true,
    photoPrinting: false
  },

  engravingSettings: {
    allowText: true,
    allowImage: false,
    maxCharacters: 80,
    placements: "",
    basePrice: 0,
    notes: ""
  },

  tags: "",
  occasions: "",
  badges: "",
  isFeatured: false,
  isBestSeller: false,
  isFlashSale: false,
  isActive: true,
  seoTitle: "",
  seoDescription: ""
};

function arrayToText(values) {
  return Array.isArray(values)
    ? values.join(", ")
    : "";
}

function textToArray(value) {
  return String(value || "")
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}

function getCategoryId(value) {
  return value?._id || value || "";
}

export default function AdminProductEditorPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const isEditing = Boolean(id);

  const [form, setForm] =
    useState(emptyForm);

  const categoriesQuery = useQuery({
    queryKey: ["admin-categories"],
    queryFn: getAdminCategories
  });

  const productQuery = useQuery({
    queryKey: ["admin-product", id],
    queryFn: () => getAdminProduct(id),
    enabled: isEditing
  });

  const categories =
    categoriesQuery.data?.categories ||
    [];

  useEffect(() => {
    const product =
      productQuery.data?.product;

    if (!product) {
      return;
    }

    setForm({
      name: product.name || "",
      slug: product.slug || "",
      sku: product.sku || "",
      shortDescription:
        product.shortDescription || "",
      description:
        product.description || "",
      price: product.price ?? "",
      salePrice:
        product.salePrice ?? "",
      stock: product.stock ?? 0,
      categoryId:
        getCategoryId(
          product.category
        ),
      subcategoryId:
        getCategoryId(
          product.subcategory
        ),
      images: product.images || [],

      serviceEligibility: {
        engraving: Boolean(
          product.serviceEligibility
            ?.engraving
        ),

        wrapping:
          product.serviceEligibility
            ?.wrapping !== false,

        photoPrinting: Boolean(
          product.serviceEligibility
            ?.photoPrinting
        )
      },

      engravingSettings: {
        allowText:
          product.engravingSettings
            ?.allowText !== false,

        allowImage: Boolean(
          product.engravingSettings
            ?.allowImage
        ),

        maxCharacters:
          product.engravingSettings
            ?.maxCharacters || 80,

        placements: arrayToText(
          product.engravingSettings
            ?.placements
        ),

        basePrice:
          product.engravingSettings
            ?.basePrice || 0,

        notes:
          product.engravingSettings
            ?.notes || ""
      },

      tags: arrayToText(product.tags),
      occasions: arrayToText(
        product.occasions
      ),
      badges: arrayToText(
        product.badges
      ),
      isFeatured: Boolean(
        product.isFeatured
      ),
      isBestSeller: Boolean(
        product.isBestSeller
      ),
      isFlashSale: Boolean(
        product.isFlashSale
      ),
      isActive:
        product.isActive !== false,
      seoTitle:
        product.seoTitle || "",
      seoDescription:
        product.seoDescription || ""
    });
  }, [productQuery.data]);

  const mainCategories = useMemo(
    () =>
      categories.filter(
        (category) =>
          !category.parent
      ),
    [categories]
  );

  const subcategories = useMemo(
    () =>
      categories.filter((category) => {
        const parentId =
          category.parent?._id ||
          category.parent;

        return (
          String(parentId || "") ===
          String(form.categoryId || "")
        );
      }),
    [categories, form.categoryId]
  );

  function updateField(field, value) {
    setForm((current) => ({
      ...current,
      [field]: value
    }));
  }

  function updateService(field, value) {
    setForm((current) => ({
      ...current,

      serviceEligibility: {
        ...current.serviceEligibility,
        [field]: value
      }
    }));
  }

  function updateEngraving(field, value) {
    setForm((current) => ({
      ...current,

      engravingSettings: {
        ...current.engravingSettings,
        [field]: value
      }
    }));
  }

  function handleCategoryChange(value) {
    const selectedCategory =
      categories.find(
        (category) =>
          category._id === value
      );

    setForm((current) => ({
      ...current,
      categoryId: value,
      subcategoryId: "",

      ...(!isEditing &&
      selectedCategory
        ? {
            serviceEligibility: {
              engraving: Boolean(
                selectedCategory
                  .serviceDefaults
                  ?.engraving
              ),

              wrapping:
                selectedCategory
                  .serviceDefaults
                  ?.wrapping !== false,

              photoPrinting: Boolean(
                selectedCategory
                  .serviceDefaults
                  ?.photoPrinting
              )
            }
          }
        : {})
    }));
  }

  function refreshProductQueries() {
    queryClient.invalidateQueries({
      queryKey: ["admin-products"]
    });

    queryClient.invalidateQueries({
      queryKey: ["admin-product"]
    });

    queryClient.invalidateQueries({
      queryKey: ["shop-products"]
    });

    queryClient.invalidateQueries({
      queryKey: [
        "home-featured-products"
      ]
    });
  }

  const saveMutation = useMutation({
    mutationFn(payload) {
      if (isEditing) {
        return updateAdminProduct({
          id,
          payload
        });
      }

      return createAdminProduct(
        payload
      );
    },

    onSuccess(response) {
      toast.success(response.message);
      refreshProductQueries();

      navigate("/admin/products", {
        replace: true
      });
    },

    onError(error) {
      toast.error(
        getAdminProductErrorMessage(error)
      );
    }
  });

  function handleSubmit(event) {
    event.preventDefault();

    if (!form.name.trim()) {
      toast.error(
        "Enter the product name"
      );

      return;
    }

    if (!form.categoryId) {
      toast.error(
        "Choose a product category"
      );

      return;
    }

    const price = Number(form.price);

    if (
      Number.isNaN(price) ||
      price < 0
    ) {
      toast.error(
        "Enter a valid product price"
      );

      return;
    }

    const salePrice =
      form.salePrice === ""
        ? null
        : Number(form.salePrice);

    if (
      salePrice !== null &&
      salePrice > price
    ) {
      toast.error(
        "Sale price cannot be greater than the regular price"
      );

      return;
    }

    saveMutation.mutate({
      name: form.name.trim(),
      slug: form.slug.trim(),
      sku: form.sku.trim(),

      shortDescription:
        form.shortDescription.trim(),

      description:
        form.description.trim(),

      price,
      salePrice,
      stock:
        Math.max(
          Number(form.stock) || 0,
          0
        ),

      categoryId:
        form.categoryId,

      subcategoryId:
        form.subcategoryId ||
        null,

      images: form.images.map(
        (image, index) => ({
          url: image.url,
          publicId: image.publicId,
          alt: image.alt || "",
          isMain:
            Boolean(image.isMain),
          sortOrder: index
        })
      ),

      serviceEligibility:
        form.serviceEligibility,

      engravingSettings: {
        allowText:
          form.engravingSettings
            .allowText,

        allowImage:
          form.engravingSettings
            .allowImage,

        maxCharacters:
          Number(
            form.engravingSettings
              .maxCharacters
          ) || 80,

        placements: textToArray(
          form.engravingSettings
            .placements
        ),

        basePrice:
          Number(
            form.engravingSettings
              .basePrice
          ) || 0,

        notes:
          form.engravingSettings
            .notes.trim()
      },

      tags: textToArray(form.tags),

      occasions: textToArray(
        form.occasions
      ),

      badges: textToArray(
        form.badges
      ),

      isFeatured:
        form.isFeatured,

      isBestSeller:
        form.isBestSeller,

      isFlashSale:
        form.isFlashSale,

      isActive:
        form.isActive,

      seoTitle:
        form.seoTitle.trim(),

      seoDescription:
        form.seoDescription.trim()
    });
  }

  if (
    isEditing &&
    productQuery.isLoading
  ) {
    return (
      <LoadingState label="Loading product..." />
    );
  }

  if (
    isEditing &&
    (productQuery.isError ||
      !productQuery.data?.product)
  ) {
    return (
      <ErrorState message="This product could not be loaded." />
    );
  }

  return (
    <form onSubmit={handleSubmit}>
      <div className="flex flex-col justify-between gap-5 lg:flex-row lg:items-end">
        <div>
          <Link
            to="/admin/products"
            className="inline-flex items-center gap-2 text-sm font-semibold text-[#735f58]"
          >
            <ArrowLeft size={17} />
            Back to products
          </Link>

          <p className="mt-5 text-sm font-semibold uppercase tracking-[0.22em] text-[#a77d70]">
            Catalog management
          </p>

          <h2 className="mt-2 text-4xl font-semibold tracking-[-0.04em]">
            {isEditing
              ? "Edit product"
              : "New product"}
          </h2>
        </div>

        <button
          type="submit"
          disabled={
            saveMutation.isPending
          }
          className="inline-flex items-center justify-center gap-2 rounded-full bg-[#2c1f1b] px-7 py-3.5 text-sm font-semibold text-white disabled:opacity-60"
        >
          {saveMutation.isPending ? (
            <LoaderCircle
              size={17}
              className="animate-spin"
            />
          ) : (
            <Save size={17} />
          )}

          {saveMutation.isPending
            ? "Saving..."
            : "Save product"}
        </button>
      </div>

      <div className="mt-8 grid gap-6">
        <section className="rounded-[1.8rem] border border-[#e5d8d2] bg-white p-6 shadow-sm">
          <h3 className="text-xl font-semibold">
            Basic information
          </h3>

          <div className="mt-6 grid gap-5 md:grid-cols-2">
            <label className="grid gap-2 md:col-span-2">
              <span className="text-sm font-semibold">
                Product name *
              </span>

              <input
                value={form.name}
                onChange={(event) =>
                  updateField(
                    "name",
                    event.target.value
                  )
                }
                className={inputClassName}
              />
            </label>

            <label className="grid gap-2">
              <span className="text-sm font-semibold">
                URL slug
              </span>

              <input
                value={form.slug}
                onChange={(event) =>
                  updateField(
                    "slug",
                    event.target.value
                  )
                }
                placeholder="Generated automatically"
                className={inputClassName}
              />
            </label>

            <label className="grid gap-2">
              <span className="text-sm font-semibold">
                SKU
              </span>

              <input
                value={form.sku}
                onChange={(event) =>
                  updateField(
                    "sku",
                    event.target.value
                  )
                }
                className={inputClassName}
              />
            </label>

            <label className="grid gap-2 md:col-span-2">
              <span className="text-sm font-semibold">
                Short description
              </span>

              <textarea
                rows={3}
                value={
                  form.shortDescription
                }
                onChange={(event) =>
                  updateField(
                    "shortDescription",
                    event.target.value
                  )
                }
                className={inputClassName}
              />
            </label>

            <label className="grid gap-2 md:col-span-2">
              <span className="text-sm font-semibold">
                Full description
              </span>

              <textarea
                rows={7}
                value={form.description}
                onChange={(event) =>
                  updateField(
                    "description",
                    event.target.value
                  )
                }
                className={inputClassName}
              />
            </label>
          </div>
        </section>

        <ProductImageManager
          images={form.images}
          onChange={(images) =>
            updateField(
              "images",
              images
            )
          }
        />

        <section className="grid gap-6 xl:grid-cols-2">
          <article className="rounded-[1.8rem] border border-[#e5d8d2] bg-white p-6 shadow-sm">
            <h3 className="text-xl font-semibold">
              Price and inventory
            </h3>

            <div className="mt-6 grid gap-5 sm:grid-cols-2">
              <label className="grid gap-2">
                <span className="text-sm font-semibold">
                  Regular price *
                </span>

                <input
                  type="number"
                  min="0"
                  step="0.01"
                  value={form.price}
                  onChange={(event) =>
                    updateField(
                      "price",
                      event.target.value
                    )
                  }
                  className={inputClassName}
                />
              </label>

              <label className="grid gap-2">
                <span className="text-sm font-semibold">
                  Sale price
                </span>

                <input
                  type="number"
                  min="0"
                  step="0.01"
                  value={form.salePrice}
                  onChange={(event) =>
                    updateField(
                      "salePrice",
                      event.target.value
                    )
                  }
                  placeholder="No sale"
                  className={inputClassName}
                />
              </label>

              <label className="grid gap-2 sm:col-span-2">
                <span className="text-sm font-semibold">
                  Available stock
                </span>

                <input
                  type="number"
                  min="0"
                  step="1"
                  value={form.stock}
                  onChange={(event) =>
                    updateField(
                      "stock",
                      event.target.value
                    )
                  }
                  className={inputClassName}
                />
              </label>
            </div>
          </article>

          <article className="rounded-[1.8rem] border border-[#e5d8d2] bg-white p-6 shadow-sm">
            <h3 className="text-xl font-semibold">
              Category
            </h3>

            <div className="mt-6 grid gap-5">
              <label className="grid gap-2">
                <span className="text-sm font-semibold">
                  Main category *
                </span>

                <select
                  value={form.categoryId}
                  onChange={(event) =>
                    handleCategoryChange(
                      event.target.value
                    )
                  }
                  className={inputClassName}
                >
                  <option value="">
                    Choose category
                  </option>

                  {mainCategories.map(
                    (category) => (
                      <option
                        key={category._id}
                        value={category._id}
                      >
                        {category.name}
                      </option>
                    )
                  )}
                </select>
              </label>

              <label className="grid gap-2">
                <span className="text-sm font-semibold">
                  Subcategory
                </span>

                <select
                  value={
                    form.subcategoryId
                  }
                  onChange={(event) =>
                    updateField(
                      "subcategoryId",
                      event.target.value
                    )
                  }
                  disabled={
                    !form.categoryId
                  }
                  className={inputClassName}
                >
                  <option value="">
                    No subcategory
                  </option>

                  {subcategories.map(
                    (category) => (
                      <option
                        key={category._id}
                        value={category._id}
                      >
                        {category.name}
                      </option>
                    )
                  )}
                </select>
              </label>
            </div>
          </article>
        </section>

        <section className="rounded-[1.8rem] border border-[#e5d8d2] bg-white p-6 shadow-sm">
          <div className="flex items-center gap-3">
            <Sparkles
              size={22}
              className="text-[#8a675c]"
            />

            <h3 className="text-xl font-semibold">
              Personalization services
            </h3>
          </div>

          <div className="mt-6 grid gap-4 md:grid-cols-3">
            {[
              ["engraving", "Engraving"],
              ["wrapping", "Gift wrapping"],
              [
                "photoPrinting",
                "Photo printing"
              ]
            ].map(([field, label]) => (
              <label
                key={field}
                className="flex cursor-pointer items-center justify-between gap-4 rounded-3xl bg-[#faf7f5] p-5"
              >
                <span className="font-semibold">
                  {label}
                </span>

                <input
                  type="checkbox"
                  checked={
                    form.serviceEligibility[
                      field
                    ]
                  }
                  onChange={(event) =>
                    updateService(
                      field,
                      event.target.checked
                    )
                  }
                  className="h-5 w-5 accent-[#5a3d34]"
                />
              </label>
            ))}
          </div>

          {form.serviceEligibility
            .engraving ? (
            <div className="mt-6 rounded-3xl border border-[#ead9d2] bg-[#fffaf7] p-5">
              <h4 className="font-semibold">
                Engraving configuration
              </h4>

              <div className="mt-5 grid gap-5 md:grid-cols-2">
                <label className="flex items-center justify-between rounded-2xl bg-white p-4">
                  <span className="font-semibold">
                    Allow text
                  </span>

                  <input
                    type="checkbox"
                    checked={
                      form
                        .engravingSettings
                        .allowText
                    }
                    onChange={(event) =>
                      updateEngraving(
                        "allowText",
                        event.target.checked
                      )
                    }
                    className="h-5 w-5 accent-[#5a3d34]"
                  />
                </label>

                <label className="flex items-center justify-between rounded-2xl bg-white p-4">
                  <span className="font-semibold">
                    Allow image/logo
                  </span>

                  <input
                    type="checkbox"
                    checked={
                      form
                        .engravingSettings
                        .allowImage
                    }
                    onChange={(event) =>
                      updateEngraving(
                        "allowImage",
                        event.target.checked
                      )
                    }
                    className="h-5 w-5 accent-[#5a3d34]"
                  />
                </label>

                <label className="grid gap-2">
                  <span className="text-sm font-semibold">
                    Base engraving price
                  </span>

                  <input
                    type="number"
                    min="0"
                    value={
                      form
                        .engravingSettings
                        .basePrice
                    }
                    onChange={(event) =>
                      updateEngraving(
                        "basePrice",
                        event.target.value
                      )
                    }
                    className={inputClassName}
                  />
                </label>

                <label className="grid gap-2">
                  <span className="text-sm font-semibold">
                    Maximum characters
                  </span>

                  <input
                    type="number"
                    min="1"
                    max="500"
                    value={
                      form
                        .engravingSettings
                        .maxCharacters
                    }
                    onChange={(event) =>
                      updateEngraving(
                        "maxCharacters",
                        event.target.value
                      )
                    }
                    className={inputClassName}
                  />
                </label>

                <label className="grid gap-2 md:col-span-2">
                  <span className="text-sm font-semibold">
                    Placements
                  </span>

                  <input
                    value={
                      form
                        .engravingSettings
                        .placements
                    }
                    onChange={(event) =>
                      updateEngraving(
                        "placements",
                        event.target.value
                      )
                    }
                    placeholder="Front, Back, Bottle side"
                    className={inputClassName}
                  />

                  <span className="text-xs text-[#806a62]">
                    Separate options using commas.
                  </span>
                </label>

                <label className="grid gap-2 md:col-span-2">
                  <span className="text-sm font-semibold">
                    Engraving notes
                  </span>

                  <textarea
                    rows={3}
                    value={
                      form
                        .engravingSettings
                        .notes
                    }
                    onChange={(event) =>
                      updateEngraving(
                        "notes",
                        event.target.value
                      )
                    }
                    className={inputClassName}
                  />
                </label>
              </div>
            </div>
          ) : null}
        </section>

        <section className="grid gap-6 xl:grid-cols-2">
          <article className="rounded-[1.8rem] border border-[#e5d8d2] bg-white p-6 shadow-sm">
            <h3 className="text-xl font-semibold">
              Search and organization
            </h3>

            <div className="mt-6 grid gap-5">
              <label className="grid gap-2">
                <span className="text-sm font-semibold">
                  Tags
                </span>

                <input
                  value={form.tags}
                  onChange={(event) =>
                    updateField(
                      "tags",
                      event.target.value
                    )
                  }
                  placeholder="gift, perfume, men"
                  className={inputClassName}
                />
              </label>

              <label className="grid gap-2">
                <span className="text-sm font-semibold">
                  Occasions
                </span>

                <input
                  value={form.occasions}
                  onChange={(event) =>
                    updateField(
                      "occasions",
                      event.target.value
                    )
                  }
                  placeholder="Birthday, Wedding, Graduation"
                  className={inputClassName}
                />
              </label>

              <label className="grid gap-2">
                <span className="text-sm font-semibold">
                  Badges
                </span>

                <input
                  value={form.badges}
                  onChange={(event) =>
                    updateField(
                      "badges",
                      event.target.value
                    )
                  }
                  placeholder="New, Personalized, Gift Ready"
                  className={inputClassName}
                />
              </label>
            </div>
          </article>

          <article className="rounded-[1.8rem] border border-[#e5d8d2] bg-white p-6 shadow-sm">
            <h3 className="text-xl font-semibold">
              Store visibility
            </h3>

            <div className="mt-6 grid gap-4">
              {[
                [
                  "isActive",
                  "Active and visible"
                ],
                [
                  "isFeatured",
                  "Featured product"
                ],
                [
                  "isBestSeller",
                  "Best seller"
                ],
                [
                  "isFlashSale",
                  "Flash sale"
                ]
              ].map(([field, label]) => (
                <label
                  key={field}
                  className="flex cursor-pointer items-center justify-between rounded-2xl bg-[#faf7f5] p-4"
                >
                  <span className="font-semibold">
                    {label}
                  </span>

                  <input
                    type="checkbox"
                    checked={form[field]}
                    onChange={(event) =>
                      updateField(
                        field,
                        event.target.checked
                      )
                    }
                    className="h-5 w-5 accent-[#5a3d34]"
                  />
                </label>
              ))}
            </div>
          </article>
        </section>

        <section className="rounded-[1.8rem] border border-[#e5d8d2] bg-white p-6 shadow-sm">
          <h3 className="text-xl font-semibold">
            Search engine information
          </h3>

          <div className="mt-6 grid gap-5">
            <label className="grid gap-2">
              <span className="text-sm font-semibold">
                SEO title
              </span>

              <input
                value={form.seoTitle}
                onChange={(event) =>
                  updateField(
                    "seoTitle",
                    event.target.value
                  )
                }
                className={inputClassName}
              />
            </label>

            <label className="grid gap-2">
              <span className="text-sm font-semibold">
                SEO description
              </span>

              <textarea
                rows={3}
                value={
                  form.seoDescription
                }
                onChange={(event) =>
                  updateField(
                    "seoDescription",
                    event.target.value
                  )
                }
                className={inputClassName}
              />
            </label>
          </div>
        </section>

        <div className="flex justify-end">
          <button
            type="submit"
            disabled={
              saveMutation.isPending
            }
            className="inline-flex items-center justify-center gap-2 rounded-full bg-[#2c1f1b] px-8 py-4 text-sm font-semibold text-white disabled:opacity-60"
          >
            {saveMutation.isPending ? (
              <LoaderCircle
                size={17}
                className="animate-spin"
              />
            ) : (
              <Save size={17} />
            )}

            {saveMutation.isPending
              ? "Saving..."
              : "Save product"}
          </button>
        </div>
      </div>
    </form>
  );
}