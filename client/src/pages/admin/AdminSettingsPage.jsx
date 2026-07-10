import {
  useEffect,
  useState
} from "react";
import {
  AlertCircle,
  CheckCircle2,
  CreditCard,
  LoaderCircle,
  MessageCircle,
  PackageSearch,
  Save,
  Settings,
  Smartphone,
  Truck,
  WalletCards
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
  getAdminStoreSettings,
  getAdminStoreSettingsErrorMessage,
  updateAdminStoreSettings
} from "../../features/admin/adminStoreSettingsApi";

const inputClassName =
  "w-full rounded-2xl border border-[#e5d8d2] bg-white px-4 py-3.5 text-[#2c1f1b] outline-none transition placeholder:text-[#ad9890] focus:border-[#9a766b] focus:ring-4 focus:ring-[#ead9d2]/40";

const emptyForm = {
  contact: {
    whatsappNumber:
      "+201508216472"
  },

  shipping: {
    cairoAndGiza: 80,
    otherGovernorates: 120
  },

  paymentMethods: {
    cod: {
      enabled: true
    },

    instapay: {
      enabled: false,
      handle: ""
    },

    vodafoneCash: {
      enabled: false,
      number: ""
    },

    card: {
      enabled: false,
      configured: false
    }
  },

  inventory: {
    lowStockThreshold: 5
  }
};

function Toggle({
  checked,
  onChange,
  disabled = false,
  label
}) {
  return (
    <label
      className={`relative inline-flex items-center ${
        disabled
          ? "cursor-not-allowed opacity-50"
          : "cursor-pointer"
      }`}
    >
      <input
        type="checkbox"
        checked={checked}
        onChange={(event) =>
          onChange(
            event.target.checked
          )
        }
        disabled={disabled}
        className="peer sr-only"
        aria-label={label}
      />

      <span className="h-7 w-12 rounded-full bg-[#d9cbc5] transition peer-checked:bg-[#2c1f1b] peer-focus:ring-4 peer-focus:ring-[#ead9d2]" />

      <span className="absolute left-1 top-1 h-5 w-5 rounded-full bg-white shadow-sm transition peer-checked:translate-x-5" />
    </label>
  );
}

function PaymentCard({
  icon: Icon,
  title,
  description,
  enabled,
  onEnabledChange,
  disabled = false,
  children,
  badge
}) {
  return (
    <article className="rounded-[1.6rem] border border-[#e5d8d2] bg-[#faf7f5] p-5">
      <div className="flex items-start justify-between gap-5">
        <div className="flex min-w-0 gap-3">
          <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-white text-[#7b584d]">
            <Icon size={20} />
          </div>

          <div>
            <div className="flex flex-wrap items-center gap-2">
              <h3 className="font-semibold text-[#2c1f1b]">
                {title}
              </h3>

              {badge ? (
                <span className="rounded-full bg-white px-2.5 py-1 text-xs font-semibold text-[#735f58]">
                  {badge}
                </span>
              ) : null}
            </div>

            <p className="mt-1 text-sm leading-6 text-[#806a62]">
              {description}
            </p>
          </div>
        </div>

        <Toggle
          checked={enabled}
          onChange={
            onEnabledChange
          }
          disabled={disabled}
          label={`Toggle ${title}`}
        />
      </div>

      {children ? (
        <div className="mt-5 border-t border-[#e8dcd6] pt-5">
          {children}
        </div>
      ) : null}
    </article>
  );
}

export default function AdminSettingsPage() {
  const queryClient =
    useQueryClient();

  const [form, setForm] =
    useState(emptyForm);

  const settingsQuery =
    useQuery({
      queryKey: [
        "admin-store-settings"
      ],

      queryFn:
        getAdminStoreSettings
    });

  useEffect(() => {
    const settings =
      settingsQuery.data
        ?.settings;

    if (settings) {
      setForm(settings);
    }
  }, [settingsQuery.data]);

  const saveMutation =
    useMutation({
      mutationFn:
        updateAdminStoreSettings,

      onSuccess(response) {
        toast.success(
          response.message
        );

        setForm(
          response.settings
        );

        queryClient.setQueryData(
          [
            "admin-store-settings"
          ],
          response
        );

        queryClient.invalidateQueries({
          queryKey: [
            "store-config"
          ]
        });

        queryClient.invalidateQueries({
          queryKey: [
            "admin-analytics"
          ]
        });

        queryClient.invalidateQueries({
          queryKey: [
            "admin-dashboard-analytics"
          ]
        });
      },

      onError(error) {
        toast.error(
          getAdminStoreSettingsErrorMessage(
            error
          )
        );
      }
    });

  function updateNested(
    section,
    field,
    value
  ) {
    setForm((current) => ({
      ...current,

      [section]: {
        ...current[section],
        [field]: value
      }
    }));
  }

  function updatePayment(
    method,
    field,
    value
  ) {
    setForm((current) => ({
      ...current,

      paymentMethods: {
        ...current.paymentMethods,

        [method]: {
          ...current
            .paymentMethods[method],

          [field]: value
        }
      }
    }));
  }

  function handleSubmit(event) {
    event.preventDefault();

    const payload = {
      contact: {
        whatsappNumber:
          form.contact
            .whatsappNumber
            .trim()
      },

      shipping: {
        cairoAndGiza:
          Number(
            form.shipping
              .cairoAndGiza
          ),

        otherGovernorates:
          Number(
            form.shipping
              .otherGovernorates
          )
      },

      paymentMethods: {
        cod: {
          enabled:
            Boolean(
              form.paymentMethods
                .cod.enabled
            )
        },

        instapay: {
          enabled:
            Boolean(
              form.paymentMethods
                .instapay.enabled
            ),

          handle:
            form.paymentMethods
              .instapay.handle
              .trim()
        },

        vodafoneCash: {
          enabled:
            Boolean(
              form.paymentMethods
                .vodafoneCash.enabled
            ),

          number:
            form.paymentMethods
              .vodafoneCash.number
              .trim()
        },

        card: {
          enabled:
            Boolean(
              form.paymentMethods
                .card.enabled
            )
        }
      },

      inventory: {
        lowStockThreshold:
          Number(
            form.inventory
              .lowStockThreshold
          )
      }
    };

    saveMutation.mutate(
      payload
    );
  }

  if (
    settingsQuery.isLoading
  ) {
    return (
      <LoadingState label="Loading store settings..." />
    );
  }

  if (
    settingsQuery.isError ||
    !settingsQuery.data
      ?.settings
  ) {
    return (
      <ErrorState message="Store settings could not be loaded." />
    );
  }

  const cardConfigured =
    Boolean(
      form.paymentMethods
        .card.configured
    );

  return (
    <div>
      <div className="flex flex-col justify-between gap-5 lg:flex-row lg:items-end">
        <div>
          <p className="text-sm font-semibold uppercase tracking-[0.22em] text-[#a77d70]">
            Store control
          </p>

          <h2 className="mt-2 text-4xl font-semibold tracking-[-0.04em] text-[#2c1f1b]">
            Settings
          </h2>

          <p className="mt-3 max-w-2xl leading-7 text-[#735f58]">
            Change delivery fees,
            payment availability,
            transfer details, WhatsApp,
            and inventory warnings
            without editing code.
          </p>
        </div>

        <div className="inline-flex w-fit items-center gap-2 rounded-full border border-[#dfd1ca] bg-white px-4 py-2.5 text-sm font-semibold text-[#5a3d34]">
          <Settings size={17} />
          Live store configuration
        </div>
      </div>

      <form
        onSubmit={handleSubmit}
        className="mt-8 grid gap-6"
      >
        <section className="rounded-[1.8rem] border border-[#e5d8d2] bg-white p-6 shadow-sm md:p-8">
          <div className="flex items-start gap-4">
            <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-[#f4e5df] text-[#7b584d]">
              <Truck size={21} />
            </div>

            <div>
              <h3 className="text-2xl font-semibold tracking-[-0.03em] text-[#2c1f1b]">
                Delivery fees
              </h3>

              <p className="mt-1 text-sm leading-6 text-[#806a62]">
                These values are used by
                checkout and verified
                again by the backend.
              </p>
            </div>
          </div>

          <div className="mt-7 grid gap-5 md:grid-cols-2">
            <label className="grid gap-2">
              <span className="text-sm font-semibold">
                Cairo & Giza
              </span>

              <div className="relative">
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  value={
                    form.shipping
                      .cairoAndGiza
                  }
                  onChange={(event) =>
                    updateNested(
                      "shipping",
                      "cairoAndGiza",
                      event.target.value
                    )
                  }
                  className={`${inputClassName} pr-16`}
                />

                <span className="pointer-events-none absolute right-4 top-1/2 -translate-y-1/2 text-sm font-semibold text-[#806a62]">
                  EGP
                </span>
              </div>
            </label>

            <label className="grid gap-2">
              <span className="text-sm font-semibold">
                Other governorates
              </span>

              <div className="relative">
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  value={
                    form.shipping
                      .otherGovernorates
                  }
                  onChange={(event) =>
                    updateNested(
                      "shipping",
                      "otherGovernorates",
                      event.target.value
                    )
                  }
                  className={`${inputClassName} pr-16`}
                />

                <span className="pointer-events-none absolute right-4 top-1/2 -translate-y-1/2 text-sm font-semibold text-[#806a62]">
                  EGP
                </span>
              </div>
            </label>
          </div>
        </section>

        <section className="rounded-[1.8rem] border border-[#e5d8d2] bg-white p-6 shadow-sm md:p-8">
          <div className="flex items-start gap-4">
            <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-[#f4e5df] text-[#7b584d]">
              <WalletCards size={21} />
            </div>

            <div>
              <h3 className="text-2xl font-semibold tracking-[-0.03em] text-[#2c1f1b]">
                Payment methods
              </h3>

              <p className="mt-1 text-sm leading-6 text-[#806a62]">
                Disabled methods disappear
                from customer checkout.
              </p>
            </div>
          </div>

          <div className="mt-7 grid gap-4 xl:grid-cols-2">
            <PaymentCard
              icon={PackageSearch}
              title="Cash on Delivery"
              description="Customers pay the delivery representative when the order arrives."
              enabled={
                form.paymentMethods
                  .cod.enabled
              }
              onEnabledChange={(
                value
              ) =>
                updatePayment(
                  "cod",
                  "enabled",
                  value
                )
              }
            />

            <PaymentCard
              icon={Smartphone}
              title="InstaPay"
              description="Customers transfer manually and upload a payment screenshot."
              enabled={
                form.paymentMethods
                  .instapay.enabled
              }
              onEnabledChange={(
                value
              ) =>
                updatePayment(
                  "instapay",
                  "enabled",
                  value
                )
              }
              badge="Manual review"
            >
              <label className="grid gap-2">
                <span className="text-sm font-semibold">
                  InstaPay address
                </span>

                <input
                  value={
                    form.paymentMethods
                      .instapay.handle
                  }
                  onChange={(event) =>
                    updatePayment(
                      "instapay",
                      "handle",
                      event.target.value
                    )
                  }
                  placeholder="username@instapay"
                  className={
                    inputClassName
                  }
                />
              </label>
            </PaymentCard>

            <PaymentCard
              icon={MessageCircle}
              title="Vodafone Cash"
              description="Customers transfer manually and upload a payment screenshot."
              enabled={
                form.paymentMethods
                  .vodafoneCash.enabled
              }
              onEnabledChange={(
                value
              ) =>
                updatePayment(
                  "vodafoneCash",
                  "enabled",
                  value
                )
              }
              badge="Manual review"
            >
              <label className="grid gap-2">
                <span className="text-sm font-semibold">
                  Vodafone Cash number
                </span>

                <input
                  value={
                    form.paymentMethods
                      .vodafoneCash.number
                  }
                  onChange={(event) =>
                    updatePayment(
                      "vodafoneCash",
                      "number",
                      event.target.value
                    )
                  }
                  placeholder="01xxxxxxxxx"
                  className={
                    inputClassName
                  }
                />
              </label>
            </PaymentCard>

            <PaymentCard
              icon={CreditCard}
              title="Visa / Mastercard"
              description={
                cardConfigured
                  ? "Paymob credentials are available. Enable this only after the payment flow is fully tested."
                  : "Paymob credentials are missing from the backend environment."
              }
              enabled={
                form.paymentMethods
                  .card.enabled
              }
              onEnabledChange={(
                value
              ) =>
                updatePayment(
                  "card",
                  "enabled",
                  value
                )
              }
              disabled={
                !cardConfigured
              }
              badge={
                cardConfigured
                  ? "Configured"
                  : "Not configured"
              }
            />
          </div>

          {!cardConfigured ? (
            <div className="mt-5 flex gap-3 rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm leading-6 text-amber-900">
              <AlertCircle
                size={18}
                className="mt-0.5 shrink-0"
              />

              <p>
                Card payment remains
                safely disabled until all
                required Paymob
                environment values are
                configured.
              </p>
            </div>
          ) : null}
        </section>

        <section className="grid gap-6 lg:grid-cols-2">
          <article className="rounded-[1.8rem] border border-[#e5d8d2] bg-white p-6 shadow-sm md:p-8">
            <div className="flex items-start gap-4">
              <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-[#f4e5df] text-[#7b584d]">
                <MessageCircle
                  size={21}
                />
              </div>

              <div>
                <h3 className="text-xl font-semibold text-[#2c1f1b]">
                  WhatsApp contact
                </h3>

                <p className="mt-1 text-sm leading-6 text-[#806a62]">
                  Used by customer support
                  links across the store.
                </p>
              </div>
            </div>

            <label className="mt-6 grid gap-2">
              <span className="text-sm font-semibold">
                WhatsApp number
              </span>

              <input
                value={
                  form.contact
                    .whatsappNumber
                }
                onChange={(event) =>
                  updateNested(
                    "contact",
                    "whatsappNumber",
                    event.target.value
                  )
                }
                placeholder="+201508216472"
                className={
                  inputClassName
                }
              />
            </label>
          </article>

          <article className="rounded-[1.8rem] border border-[#e5d8d2] bg-white p-6 shadow-sm md:p-8">
            <div className="flex items-start gap-4">
              <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-[#f4e5df] text-[#7b584d]">
                <PackageSearch
                  size={21}
                />
              </div>

              <div>
                <h3 className="text-xl font-semibold text-[#2c1f1b]">
                  Inventory warnings
                </h3>

                <p className="mt-1 text-sm leading-6 text-[#806a62]">
                  Products at or below
                  this stock amount appear
                  in low-stock alerts.
                </p>
              </div>
            </div>

            <label className="mt-6 grid gap-2">
              <span className="text-sm font-semibold">
                Low-stock threshold
              </span>

              <input
                type="number"
                min="0"
                step="1"
                value={
                  form.inventory
                    .lowStockThreshold
                }
                onChange={(event) =>
                  updateNested(
                    "inventory",
                    "lowStockThreshold",
                    event.target.value
                  )
                }
                className={
                  inputClassName
                }
              />
            </label>
          </article>
        </section>

        <div className="sticky bottom-4 z-10 flex justify-end rounded-[1.5rem] border border-[#e5d8d2] bg-white/95 p-4 shadow-lg backdrop-blur">
          <button
            type="submit"
            disabled={
              saveMutation.isPending
            }
            className="inline-flex items-center justify-center gap-2 rounded-full bg-[#2c1f1b] px-7 py-3.5 text-sm font-semibold text-white transition hover:bg-[#4b332b] disabled:cursor-not-allowed disabled:opacity-60"
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
              ? "Saving settings..."
              : "Save settings"}
          </button>
        </div>

        {saveMutation.isSuccess ? (
          <div className="flex gap-3 rounded-2xl border border-green-200 bg-green-50 p-4 text-sm text-green-800">
            <CheckCircle2
              size={18}
              className="mt-0.5 shrink-0"
            />

            <p>
              The new configuration is
              active for checkout,
              pricing, and analytics.
            </p>
          </div>
        ) : null}
      </form>
    </div>
  );
}
