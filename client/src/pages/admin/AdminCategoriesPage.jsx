import {
  useMemo,
  useState
} from "react";
import {
  Check,
  Eye,
  EyeOff,
  FolderPlus,
  FolderTree,
  Pencil,
  Save,
  Search,
  Trash2,
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
  createAdminCategory,
  deleteAdminCategory,
  getAdminCategories,
  getAdminCategoryErrorMessage,
  updateAdminCategory
} from "../../features/admin/adminCategoryApi";

const emptyForm = {
  name: "",
  slug: "",
  description: "",
  parentId: "",
  sortOrder: 0,
  showInMenu: true,
  showOnHome: false,
  isActive: true,

  serviceDefaults: {
    engraving: false,
    wrapping: true,
    photoPrinting: false
  }
};

const inputClassName =
  "w-full rounded-2xl border border-[#e5d8d2] bg-white px-4 py-3 text-[#2c1f1b] outline-none transition focus:border-[#9a766b] focus:ring-4 focus:ring-[#ead9d2]/40";

function getParentId(category) {
  if (!category?.parent) {
    return "";
  }

  return category.parent._id || category.parent;
}

export default function AdminCategoriesPage() {
  const queryClient = useQueryClient();

  const [search, setSearch] = useState("");
  const [editingId, setEditingId] = useState("");
  const [form, setForm] = useState(emptyForm);

  const categoriesQuery = useQuery({
    queryKey: ["admin-categories"],
    queryFn: getAdminCategories
  });

  const categories =
    categoriesQuery.data?.categories || [];

  const visibleCategories = useMemo(() => {
    const normalizedSearch = search
      .trim()
      .toLowerCase();

    if (!normalizedSearch) {
      return categories;
    }

    return categories.filter((category) => {
      return [
        category.name,
        category.slug,
        category.description,
        category.parent?.name
      ]
        .filter(Boolean)
        .some((value) =>
          String(value)
            .toLowerCase()
            .includes(normalizedSearch)
        );
    });
  }, [categories, search]);

  function refreshCategoryQueries() {
    queryClient.invalidateQueries({
      queryKey: ["admin-categories"]
    });

    queryClient.invalidateQueries({
      queryKey: ["home-categories"]
    });

    queryClient.invalidateQueries({
      queryKey: ["category"]
    });
  }

  function resetForm() {
    setEditingId("");
    setForm(emptyForm);
  }

  const saveMutation = useMutation({
    mutationFn({ id, payload }) {
      if (id) {
        return updateAdminCategory({
          id,
          payload
        });
      }

      return createAdminCategory(payload);
    },

    onSuccess(response) {
      toast.success(response.message);
      resetForm();
      refreshCategoryQueries();
    },

    onError(error) {
      toast.error(
        getAdminCategoryErrorMessage(error)
      );
    }
  });

  const deleteMutation = useMutation({
    mutationFn: deleteAdminCategory,

    onSuccess(response) {
      toast.success(response.message);
      resetForm();
      refreshCategoryQueries();
    },

    onError(error) {
      toast.error(
        getAdminCategoryErrorMessage(error)
      );
    }
  });

  function updateField(field, value) {
    setForm((current) => ({
      ...current,
      [field]: value
    }));
  }

  function updateServiceField(field, value) {
    setForm((current) => ({
      ...current,

      serviceDefaults: {
        ...current.serviceDefaults,
        [field]: value
      }
    }));
  }

  function startEditing(category) {
    setEditingId(category._id);

    setForm({
      name: category.name || "",
      slug: category.slug || "",
      description: category.description || "",
      parentId: getParentId(category),
      sortOrder: category.sortOrder || 0,
      showInMenu: Boolean(category.showInMenu),
      showOnHome: Boolean(category.showOnHome),
      isActive: Boolean(category.isActive),

      serviceDefaults: {
        engraving: Boolean(
          category.serviceDefaults?.engraving
        ),

        wrapping:
          category.serviceDefaults?.wrapping !== false,

        photoPrinting: Boolean(
          category.serviceDefaults?.photoPrinting
        )
      }
    });

    window.scrollTo({
      top: 0,
      behavior: "smooth"
    });
  }

  function handleSubmit(event) {
    event.preventDefault();

    if (!form.name.trim()) {
      toast.error("Enter the category name");
      return;
    }

    saveMutation.mutate({
      id: editingId,

      payload: {
        name: form.name.trim(),
        slug: form.slug.trim(),
        description: form.description.trim(),
        parentId: form.parentId || null,
        sortOrder: Number(form.sortOrder) || 0,
        showInMenu: form.showInMenu,
        showOnHome: form.showOnHome,
        isActive: form.isActive,
        serviceDefaults: form.serviceDefaults
      }
    });
  }

  function handleDelete(category) {
    const confirmed = window.confirm(
      `Delete "${category.name}" permanently?\n\nCategories containing products or subcategories cannot be deleted.`
    );

    if (!confirmed) {
      return;
    }

    deleteMutation.mutate(category._id);
  }

  return (
    <div>
      <div className="flex flex-col justify-between gap-5 lg:flex-row lg:items-end">
        <div>
          <p className="text-sm font-semibold uppercase tracking-[0.22em] text-[#a77d70]">
            Store structure
          </p>

          <h2 className="mt-2 text-4xl font-semibold tracking-[-0.04em]">
            Categories
          </h2>

          <p className="mt-3 max-w-2xl leading-7 text-[#735f58]">
            Organize products, control homepage visibility,
            and define which personalization services apply
            by default.
          </p>
        </div>

        <div className="inline-flex w-fit items-center gap-2 rounded-full border border-[#dfd1ca] bg-white px-4 py-2.5 text-sm font-semibold text-[#5a3d34]">
          <FolderTree size={17} />
          {categories.length} categories
        </div>
      </div>

      <section className="mt-8 grid gap-6 xl:grid-cols-[390px_1fr]">
        <form
          onSubmit={handleSubmit}
          className="h-fit rounded-[1.8rem] border border-[#e5d8d2] bg-white p-6 shadow-sm xl:sticky xl:top-28"
        >
          <div className="flex items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-[#f4e5df] text-[#7b584d]">
                {editingId ? (
                  <Pencil size={20} />
                ) : (
                  <FolderPlus size={20} />
                )}
              </div>

              <div>
                <h3 className="text-xl font-semibold">
                  {editingId
                    ? "Edit category"
                    : "New category"}
                </h3>

                <p className="mt-1 text-sm text-[#806a62]">
                  {editingId
                    ? "Update category settings"
                    : "Add a category or subcategory"}
                </p>
              </div>
            </div>

            {editingId ? (
              <button
                type="button"
                onClick={resetForm}
                className="rounded-full border border-[#e5d8d2] p-2 text-[#735f58] transition hover:bg-[#fff8f4]"
                aria-label="Cancel editing"
              >
                <X size={17} />
              </button>
            ) : null}
          </div>

          <div className="mt-6 grid gap-4">
            <label className="grid gap-2">
              <span className="text-sm font-semibold">
                Category name *
              </span>

              <input
                value={form.name}
                onChange={(event) =>
                  updateField("name", event.target.value)
                }
                placeholder="Example: Gift Boxes"
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
                  updateField("slug", event.target.value)
                }
                placeholder="Generated automatically"
                className={inputClassName}
              />

              <span className="text-xs text-[#8d756c]">
                Leave empty to generate it from the name.
              </span>
            </label>

            <label className="grid gap-2">
              <span className="text-sm font-semibold">
                Parent category
              </span>

              <select
                value={form.parentId}
                onChange={(event) =>
                  updateField(
                    "parentId",
                    event.target.value
                  )
                }
                className={inputClassName}
              >
                <option value="">
                  None — main category
                </option>

                {categories
                  .filter(
                    (category) =>
                      category._id !== editingId
                  )
                  .map((category) => (
                    <option
                      key={category._id}
                      value={category._id}
                    >
                      {"— ".repeat(category.level || 0)}
                      {category.name}
                    </option>
                  ))}
              </select>
            </label>

            <label className="grid gap-2">
              <span className="text-sm font-semibold">
                Description
              </span>

              <textarea
                value={form.description}
                onChange={(event) =>
                  updateField(
                    "description",
                    event.target.value
                  )
                }
                rows={4}
                placeholder="Describe what customers will find here..."
                className={inputClassName}
              />
            </label>

            <label className="grid gap-2">
              <span className="text-sm font-semibold">
                Display order
              </span>

              <input
                type="number"
                value={form.sortOrder}
                onChange={(event) =>
                  updateField(
                    "sortOrder",
                    event.target.value
                  )
                }
                className={inputClassName}
              />
            </label>

            <div className="rounded-3xl bg-[#faf7f5] p-4">
              <p className="text-sm font-semibold">
                Visibility
              </p>

              <div className="mt-4 grid gap-3">
                <label className="flex cursor-pointer items-center justify-between gap-4">
                  <span className="text-sm text-[#735f58]">
                    Show in navigation menu
                  </span>

                  <input
                    type="checkbox"
                    checked={form.showInMenu}
                    onChange={(event) =>
                      updateField(
                        "showInMenu",
                        event.target.checked
                      )
                    }
                    className="h-5 w-5 accent-[#5a3d34]"
                  />
                </label>

                <label className="flex cursor-pointer items-center justify-between gap-4">
                  <span className="text-sm text-[#735f58]">
                    Show on homepage
                  </span>

                  <input
                    type="checkbox"
                    checked={form.showOnHome}
                    onChange={(event) =>
                      updateField(
                        "showOnHome",
                        event.target.checked
                      )
                    }
                    className="h-5 w-5 accent-[#5a3d34]"
                  />
                </label>

                <label className="flex cursor-pointer items-center justify-between gap-4">
                  <span className="text-sm text-[#735f58]">
                    Active category
                  </span>

                  <input
                    type="checkbox"
                    checked={form.isActive}
                    onChange={(event) =>
                      updateField(
                        "isActive",
                        event.target.checked
                      )
                    }
                    className="h-5 w-5 accent-[#5a3d34]"
                  />
                </label>
              </div>
            </div>

            <div className="rounded-3xl bg-[#faf7f5] p-4">
              <p className="text-sm font-semibold">
                Default services
              </p>

              <p className="mt-1 text-xs leading-5 text-[#806a62]">
                New products in this category can inherit
                these service settings.
              </p>

              <div className="mt-4 grid gap-3">
                <label className="flex cursor-pointer items-center justify-between gap-4">
                  <span className="text-sm text-[#735f58]">
                    Engraving
                  </span>

                  <input
                    type="checkbox"
                    checked={
                      form.serviceDefaults.engraving
                    }
                    onChange={(event) =>
                      updateServiceField(
                        "engraving",
                        event.target.checked
                      )
                    }
                    className="h-5 w-5 accent-[#5a3d34]"
                  />
                </label>

                <label className="flex cursor-pointer items-center justify-between gap-4">
                  <span className="text-sm text-[#735f58]">
                    Gift wrapping
                  </span>

                  <input
                    type="checkbox"
                    checked={
                      form.serviceDefaults.wrapping
                    }
                    onChange={(event) =>
                      updateServiceField(
                        "wrapping",
                        event.target.checked
                      )
                    }
                    className="h-5 w-5 accent-[#5a3d34]"
                  />
                </label>

                <label className="flex cursor-pointer items-center justify-between gap-4">
                  <span className="text-sm text-[#735f58]">
                    Photo printing
                  </span>

                  <input
                    type="checkbox"
                    checked={
                      form.serviceDefaults.photoPrinting
                    }
                    onChange={(event) =>
                      updateServiceField(
                        "photoPrinting",
                        event.target.checked
                      )
                    }
                    className="h-5 w-5 accent-[#5a3d34]"
                  />
                </label>
              </div>
            </div>

            <button
              type="submit"
              disabled={saveMutation.isPending}
              className="flex items-center justify-center gap-2 rounded-full bg-[#2c1f1b] px-6 py-3.5 text-sm font-semibold text-white transition hover:bg-[#4b332b] disabled:cursor-not-allowed disabled:opacity-60"
            >
              <Save size={17} />

              {saveMutation.isPending
                ? "Saving..."
                : editingId
                  ? "Save changes"
                  : "Create category"}
            </button>
          </div>
        </form>

        <div>
          <div className="relative">
            <Search
              size={18}
              className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-[#9a8178]"
            />

            <input
              value={search}
              onChange={(event) =>
                setSearch(event.target.value)
              }
              placeholder="Search categories..."
              className="w-full rounded-2xl border border-[#e5d8d2] bg-white py-3.5 pl-11 pr-4 outline-none transition focus:border-[#9a766b]"
            />
          </div>

          <div className="mt-4">
            {categoriesQuery.isLoading ? (
              <LoadingState label="Loading categories..." />
            ) : null}

            {categoriesQuery.isError ? (
              <ErrorState message="Categories could not be loaded." />
            ) : null}

            {!categoriesQuery.isLoading &&
            !categoriesQuery.isError &&
            !visibleCategories.length ? (
              <div className="rounded-[1.8rem] border border-[#e5d8d2] bg-white p-12 text-center">
                <FolderTree
                  size={38}
                  className="mx-auto text-[#a98a7f]"
                />

                <h3 className="mt-4 text-xl font-semibold">
                  No matching categories
                </h3>
              </div>
            ) : null}

            {!categoriesQuery.isLoading &&
            !categoriesQuery.isError &&
            visibleCategories.length ? (
              <div className="grid gap-3">
                {visibleCategories.map((category) => (
                  <article
                    key={category._id}
                    className="rounded-[1.6rem] border border-[#e5d8d2] bg-white p-5 shadow-sm"
                  >
                    <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-start">
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                          <h3
                            className="font-semibold text-[#2c1f1b]"
                            style={{
                              paddingLeft: `${
                                (category.level || 0) * 18
                              }px`
                            }}
                          >
                            {category.level > 0
                              ? "↳ "
                              : ""}
                            {category.name}
                          </h3>

                          {category.isActive ? (
                            <span className="inline-flex items-center gap-1 rounded-full bg-green-50 px-2.5 py-1 text-xs font-semibold text-green-700">
                              <Check size={12} />
                              Active
                            </span>
                          ) : (
                            <span className="rounded-full bg-stone-100 px-2.5 py-1 text-xs font-semibold text-stone-600">
                              Inactive
                            </span>
                          )}
                        </div>

                        <p className="mt-2 text-sm text-[#806a62]">
                          /categories/{category.slug}
                        </p>

                        {category.parent?.name ? (
                          <p className="mt-2 text-sm text-[#806a62]">
                            Parent: {category.parent.name}
                          </p>
                        ) : null}

                        {category.description ? (
                          <p className="mt-3 line-clamp-2 text-sm leading-6 text-[#735f58]">
                            {category.description}
                          </p>
                        ) : null}
                      </div>

                      <div className="flex shrink-0 gap-2">
                        <button
                          type="button"
                          onClick={() =>
                            startEditing(category)
                          }
                          className="inline-flex items-center gap-2 rounded-full border border-[#e5d8d2] px-4 py-2 text-sm font-semibold text-[#5a3d34] transition hover:bg-[#fff8f4]"
                        >
                          <Pencil size={15} />
                          Edit
                        </button>

                        <button
                          type="button"
                          onClick={() =>
                            handleDelete(category)
                          }
                          disabled={deleteMutation.isPending}
                          className="rounded-full border border-red-200 bg-red-50 p-2.5 text-red-700 transition hover:bg-red-100 disabled:opacity-50"
                          aria-label={`Delete ${category.name}`}
                        >
                          <Trash2 size={16} />
                        </button>
                      </div>
                    </div>

                    <div className="mt-5 flex flex-wrap gap-2 border-t border-[#eee3de] pt-4">
                      <span className="rounded-full bg-[#faf7f5] px-3 py-1.5 text-xs font-semibold text-[#735f58]">
                        {category.productCount} products
                      </span>

                      <span className="rounded-full bg-[#faf7f5] px-3 py-1.5 text-xs font-semibold text-[#735f58]">
                        {category.childCount} subcategories
                      </span>

                      <span className="inline-flex items-center gap-1 rounded-full bg-[#faf7f5] px-3 py-1.5 text-xs font-semibold text-[#735f58]">
                        {category.showInMenu ? (
                          <Eye size={12} />
                        ) : (
                          <EyeOff size={12} />
                        )}

                        Menu
                      </span>

                      <span className="inline-flex items-center gap-1 rounded-full bg-[#faf7f5] px-3 py-1.5 text-xs font-semibold text-[#735f58]">
                        {category.showOnHome ? (
                          <Eye size={12} />
                        ) : (
                          <EyeOff size={12} />
                        )}

                        Homepage
                      </span>

                      {category.serviceDefaults?.engraving ? (
                        <span className="rounded-full bg-[#f4e5df] px-3 py-1.5 text-xs font-semibold text-[#7b584d]">
                          Engraving
                        </span>
                      ) : null}

                      {category.serviceDefaults?.wrapping ? (
                        <span className="rounded-full bg-[#fff4ef] px-3 py-1.5 text-xs font-semibold text-[#7b584d]">
                          Wrapping
                        </span>
                      ) : null}

                      {category.serviceDefaults
                        ?.photoPrinting ? (
                        <span className="rounded-full bg-[#f4e5df] px-3 py-1.5 text-xs font-semibold text-[#7b584d]">
                          Photo printing
                        </span>
                      ) : null}
                    </div>
                  </article>
                ))}
              </div>
            ) : null}
          </div>
        </div>
      </section>
    </div>
  );
}