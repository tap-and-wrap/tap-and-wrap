import {
  useEffect,
  useMemo,
  useRef,
  useState
} from "react";
import {
  Navigate,
  Link,
  useNavigate
} from "react-router-dom";
import {
  useMutation,
  useQuery
} from "@tanstack/react-query";
import {
  AlertCircle,
  CheckCircle2,
  Gift,
  LoaderCircle,
  LockKeyhole,
  MapPin,
  PackageCheck,
  ShieldCheck,
  Truck
} from "lucide-react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import toast from "react-hot-toast";

import Header from "../components/layout/Header";
import Footer from "../components/layout/Footer";
import CheckoutField from "../components/checkout/CheckoutField";
import PaymentMethodCard from "../components/checkout/PaymentMethodCard";
import DiscountCodeBox from "../components/discount/DiscountCodeBox";
import AppliedOffersBox from "../components/offer/AppliedOffersBox";
import CustomerImageUploader from "../components/upload/CustomerImageUploader";
import LoadingState from "../components/ui/LoadingState";
import ErrorState from "../components/ui/ErrorState";

import { useCart } from "../context/CartContext";
import { egyptGovernorates } from "../data/egyptGovernorates";
import { getStoreConfig } from "../features/store/storeApi";
import {
  createOrder,
  getOrderErrorMessage
} from "../features/orders/orderApi";
import {
  getPricingErrorMessage,
  previewOrderPricing
} from "../features/pricing/pricingApi";
import { formatPrice } from "../utils/cartUtils";
import { createOrderItems } from "../utils/orderPayload";

const phoneValidation = z
  .string()
  .trim()
  .min(8, "Enter a valid phone number")
  .max(20, "Phone number is too long")
  .regex(/^\+?[0-9\s-]+$/, "Use numbers only");

const checkoutSchema = z.object({
  customer: z.object({
    fullName: z
      .string()
      .trim()
      .min(2, "Enter your full name")
      .max(100),

    email: z
      .string()
      .trim()
      .email("Enter a valid email address")
      .max(150),

    phone: phoneValidation,

    alternatePhone: z
      .string()
      .trim()
      .refine(
        (value) =>
          value === "" || /^\+?[0-9\s-]{8,20}$/.test(value),
        "Enter a valid alternate phone number"
      )
  }),

  shippingAddress: z.object({
    recipientName: z
      .string()
      .trim()
      .min(2, "Enter the recipient's name")
      .max(100),

    recipientPhone: phoneValidation,

    governorate: z
      .string()
      .trim()
      .min(1, "Choose a governorate"),

    city: z
      .string()
      .trim()
      .min(2, "Enter the city")
      .max(100),

    area: z.string().trim().max(150),

    addressLine: z
      .string()
      .trim()
      .min(5, "Enter the complete delivery address")
      .max(500),

    building: z.string().trim().max(100),
    floor: z.string().trim().max(50),
    apartment: z.string().trim().max(50),
    landmark: z.string().trim().max(250)
  }),

  paymentMethod: z.enum([
    "cod",
    "instapay",
    "vodafone_cash",
    "card"
  ]),

  customerNote: z
    .string()
    .trim()
    .max(1000, "The note is too long")
});

const inputClassName =
  "w-full rounded-2xl border border-[#ead9d2] bg-white px-4 py-3.5 text-[#2c1f1b] outline-none transition placeholder:text-[#b09a92] focus:border-[#8a675c] focus:ring-4 focus:ring-[#ead9d2]/45";

function isCairoOrGiza(governorate) {
  const normalized = String(governorate || "")
    .trim()
    .toLowerCase();

  return normalized === "cairo" || normalized === "giza";
}

function isManualPayment(method) {
  return method === "instapay" || method === "vodafone_cash";
}

function getPricingEmail(value) {
  const email = String(value || "").trim().toLowerCase();

  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)
    ? email
    : "";
}

export default function CheckoutPage() {
  const navigate = useNavigate();

  const {
    items,
    subtotal,
    discountCode,
    clearCart,
    setDiscountCode,
    clearDiscountCode
  } = useCart();

  const [paymentProof, setPaymentProof] = useState(null);
  const previousPaymentMethod = useRef("cod");

  const itemSignature = useMemo(
    () =>
      items
        .map((item) => `${item.id}:${item.quantity}`)
        .join("|"),
    [items]
  );

  const storeConfigQuery = useQuery({
    queryKey: ["store-config"],
    queryFn: getStoreConfig
  });

  const config = storeConfigQuery.data?.config;

  const {
    register,
    handleSubmit,
    watch,
    setValue,
    formState: {
      errors
    }
  } = useForm({
    resolver: zodResolver(checkoutSchema),

    defaultValues: {
      customer: {
        fullName: "",
        email: "",
        phone: "",
        alternatePhone: ""
      },

      shippingAddress: {
        recipientName: "",
        recipientPhone: "",
        governorate: "",
        city: "",
        area: "",
        addressLine: "",
        building: "",
        floor: "",
        apartment: "",
        landmark: ""
      },

      paymentMethod: "cod",
      customerNote: ""
    }
  });

  const governorate = watch("shippingAddress.governorate");
  const customerEmail = watch("customer.email");
  const selectedPaymentMethod = watch("paymentMethod");
  const pricingEmail = getPricingEmail(customerEmail);

  const shippingFee = useMemo(() => {
    if (!governorate || !config?.shipping) {
      return 0;
    }

    return isCairoOrGiza(governorate)
      ? config.shipping.cairoAndGiza
      : config.shipping.otherGovernorates;
  }, [governorate, config]);

  const pricingQuery = useQuery({
    queryKey: [
      "order-pricing",
      itemSignature,
      discountCode,
      governorate,
      pricingEmail
    ],
    queryFn: () =>
      previewOrderPricing({
        items: createOrderItems(items),
        shippingAddress: {
          governorate: governorate || ""
        },
        customerEmail: pricingEmail,
        discountCode
      }),
    enabled: items.length > 0,
    retry: false
  });

  const pricing = pricingQuery.data;
  const offers = pricing?.offers || [];
  const offerDiscount = Number(
    pricing?.totals?.offerDiscount || 0
  );
  const codeDiscount = Number(
    pricing?.totals?.codeDiscount || 0
  );
  const grandTotal = pricingQuery.isSuccess
    ? Number(pricing?.totals?.grandTotal || 0)
    : subtotal + shippingFee;

  const discountError = pricing?.discountError || "";
  const pricingRequestError = pricingQuery.isError
    ? getPricingErrorMessage(pricingQuery.error)
    : "";

  const orderMutation = useMutation({
    mutationFn: createOrder,

    onSuccess(response, variables) {
      const completedOrder = {
        ...response.order,

        paymentFlow:
          response.payment || null
      };

      sessionStorage.setItem(
        "tap_wrap_last_order",
        JSON.stringify(completedOrder)
      );

      if (
        completedOrder.paymentMethod ===
        "card"
      ) {
        sessionStorage.setItem(
          "tap_wrap_last_card_email",
          variables.customer.email
        );
      }

      clearCart();

      if (
        response.payment
          ?.redirectUrl
      ) {
        window.location.assign(
          response.payment
            .redirectUrl
        );

        return;
      }

      navigate(
        `/order-success/${completedOrder.orderNumber}`,
        {
          replace: true,

          state: {
            order:
              completedOrder
          }
        }
      );
    },

    onError(error) {
      toast.error(getOrderErrorMessage(error));
    }
  });

  useEffect(() => {
    if (!config?.paymentMethods) {
      return;
    }

    const methods = config.paymentMethods;

    const enabledMethods = [
      {
        key: "cod",
        enabled: methods.cod?.enabled
      },
      {
        key: "instapay",
        enabled: methods.instapay?.enabled
      },
      {
        key: "vodafone_cash",
        enabled: methods.vodafoneCash?.enabled
      },
      {
        key: "card",
        enabled: methods.card?.enabled
      }
    ];

    const currentMethod = enabledMethods.find(
      (method) => method.key === selectedPaymentMethod
    );

    if (!currentMethod?.enabled) {
      const firstAvailable = enabledMethods.find(
        (method) => method.enabled
      );

      if (firstAvailable) {
        setValue("paymentMethod", firstAvailable.key, {
          shouldValidate: true
        });
      }
    }
  }, [config, selectedPaymentMethod, setValue]);

  useEffect(() => {
    if (previousPaymentMethod.current !== selectedPaymentMethod) {
      setPaymentProof(null);
      previousPaymentMethod.current = selectedPaymentMethod;
    }
  }, [selectedPaymentMethod]);

  function handleApplyDiscount(code) {
    if (code === discountCode) {
      pricingQuery.refetch();
      return;
    }

    setDiscountCode(code);
  }

  function submitCheckout(values) {
    if (pricingQuery.isFetching) {
      toast.error(
        "Please wait while the final order price is being checked."
      );

      return;
    }

    if (pricingQuery.isError) {
      toast.error(getPricingErrorMessage(pricingQuery.error));
      return;
    }

    if (discountCode && discountError) {
      toast.error(discountError);
      return;
    }

    const manualPayment = isManualPayment(values.paymentMethod);

    if (manualPayment && !paymentProof?.imageUrl) {
      toast.error(
        "Please upload the payment transfer screenshot."
      );

      return;
    }

    const payload = {
      customer: values.customer,
      shippingAddress: values.shippingAddress,
      items: createOrderItems(items),
      paymentMethod: values.paymentMethod,
      discountCode,
      customerNote: values.customerNote
    };

    if (manualPayment) {
      payload.paymentProof = {
        imageUrl: paymentProof.imageUrl,
        imagePublicId: paymentProof.imagePublicId,
        originalFileName: paymentProof.originalFileName || ""
      };
    }

    orderMutation.mutate(payload);
  }

  if (!items.length) {
    return <Navigate to="/cart" replace />;
  }

  if (storeConfigQuery.isLoading) {
    return (
      <>
        <Header />

        <main className="mx-auto max-w-7xl px-5 py-14">
          <LoadingState label="Preparing checkout..." />
        </main>

        <Footer />
      </>
    );
  }

  if (storeConfigQuery.isError || !config) {
    return (
      <>
        <Header />

        <main className="mx-auto max-w-7xl px-5 py-14">
          <ErrorState message="Checkout settings could not be loaded. Make sure the backend is running." />
        </main>

        <Footer />
      </>
    );
  }

  const paymentMethods = config.paymentMethods;
  const manualPaymentSelected = isManualPayment(
    selectedPaymentMethod
  );

  const paymentDestination =
    selectedPaymentMethod === "instapay"
      ? paymentMethods.instapay.handle
      : paymentMethods.vodafoneCash.number;

  return (
    <>
      <Header />

      <main className="mx-auto max-w-7xl px-5 py-12">
        <div className="mb-10">
          <p className="text-sm font-semibold uppercase tracking-[0.25em] text-[#b08a7c]">
            Secure checkout
          </p>

          <h1 className="mt-3 text-4xl font-semibold tracking-[-0.04em] text-[#2c1f1b] md:text-5xl">
            Complete your gift order.
          </h1>

          <p className="mt-4 max-w-2xl leading-7 text-[#735f58]">
            Enter the customer and recipient details. Tap & Wrap will verify products, offers, customization, payment, and delivery securely.
          </p>
        </div>

        <form
          onSubmit={handleSubmit(submitCheckout)}
          className="grid gap-8 lg:grid-cols-[1fr_390px]"
        >
          <div className="grid gap-6">
            <section className="rounded-[2rem] border border-[#ead9d2] bg-white/85 p-6 shadow-sm md:p-8">
              <div className="flex items-start gap-4">
                <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-[#f4e5df] text-[#7b584d]">
                  <Gift size={22} />
                </div>

                <div>
                  <h2 className="text-2xl font-semibold tracking-[-0.03em] text-[#2c1f1b]">
                    Customer information
                  </h2>

                  <p className="mt-1 text-sm leading-6 text-[#806a62]">
                    Used for order confirmation, discount limits, and updates.
                  </p>
                </div>
              </div>

              <div className="mt-7 grid gap-5 md:grid-cols-2">
                <CheckoutField
                  label="Full name"
                  required
                  error={errors.customer?.fullName?.message}
                >
                  <input
                    {...register("customer.fullName")}
                    placeholder="Youssef Khaled"
                    autoComplete="name"
                    className={inputClassName}
                  />
                </CheckoutField>

                <CheckoutField
                  label="Email address"
                  required
                  error={errors.customer?.email?.message}
                >
                  <input
                    {...register("customer.email")}
                    type="email"
                    placeholder="name@example.com"
                    autoComplete="email"
                    className={inputClassName}
                  />
                </CheckoutField>

                <CheckoutField
                  label="Phone number"
                  required
                  error={errors.customer?.phone?.message}
                >
                  <input
                    {...register("customer.phone")}
                    type="tel"
                    placeholder="01xxxxxxxxx"
                    autoComplete="tel"
                    className={inputClassName}
                  />
                </CheckoutField>

                <CheckoutField
                  label="Alternate phone"
                  error={errors.customer?.alternatePhone?.message}
                >
                  <input
                    {...register("customer.alternatePhone")}
                    type="tel"
                    placeholder="Optional"
                    className={inputClassName}
                  />
                </CheckoutField>
              </div>
            </section>

            <section className="rounded-[2rem] border border-[#ead9d2] bg-white/85 p-6 shadow-sm md:p-8">
              <div className="flex items-start gap-4">
                <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-[#f4e5df] text-[#7b584d]">
                  <MapPin size={22} />
                </div>

                <div>
                  <h2 className="text-2xl font-semibold tracking-[-0.03em] text-[#2c1f1b]">
                    Recipient and delivery
                  </h2>

                  <p className="mt-1 text-sm leading-6 text-[#806a62]">
                    The gift can be delivered directly to another person.
                  </p>
                </div>
              </div>

              <div className="mt-7 grid gap-5 md:grid-cols-2">
                <CheckoutField
                  label="Recipient name"
                  required
                  error={errors.shippingAddress?.recipientName?.message}
                >
                  <input
                    {...register("shippingAddress.recipientName")}
                    placeholder="Recipient full name"
                    className={inputClassName}
                  />
                </CheckoutField>

                <CheckoutField
                  label="Recipient phone"
                  required
                  error={errors.shippingAddress?.recipientPhone?.message}
                >
                  <input
                    {...register("shippingAddress.recipientPhone")}
                    type="tel"
                    placeholder="01xxxxxxxxx"
                    className={inputClassName}
                  />
                </CheckoutField>

                <CheckoutField
                  label="Governorate"
                  required
                  error={errors.shippingAddress?.governorate?.message}
                >
                  <select
                    {...register("shippingAddress.governorate")}
                    className={inputClassName}
                  >
                    <option value="">
                      Choose governorate
                    </option>

                    {egyptGovernorates.map((governorateName) => (
                      <option
                        key={governorateName}
                        value={governorateName}
                      >
                        {governorateName}
                      </option>
                    ))}
                  </select>
                </CheckoutField>

                <CheckoutField
                  label="City"
                  required
                  error={errors.shippingAddress?.city?.message}
                >
                  <input
                    {...register("shippingAddress.city")}
                    placeholder="Example: New Cairo"
                    className={inputClassName}
                  />
                </CheckoutField>

                <CheckoutField
                  label="Area"
                  error={errors.shippingAddress?.area?.message}
                >
                  <input
                    {...register("shippingAddress.area")}
                    placeholder="Example: Fifth Settlement"
                    className={inputClassName}
                  />
                </CheckoutField>

                <CheckoutField
                  label="Building"
                  error={errors.shippingAddress?.building?.message}
                >
                  <input
                    {...register("shippingAddress.building")}
                    placeholder="Building number"
                    className={inputClassName}
                  />
                </CheckoutField>

                <CheckoutField
                  label="Floor"
                  error={errors.shippingAddress?.floor?.message}
                >
                  <input
                    {...register("shippingAddress.floor")}
                    placeholder="Optional"
                    className={inputClassName}
                  />
                </CheckoutField>

                <CheckoutField
                  label="Apartment"
                  error={errors.shippingAddress?.apartment?.message}
                >
                  <input
                    {...register("shippingAddress.apartment")}
                    placeholder="Optional"
                    className={inputClassName}
                  />
                </CheckoutField>

                <div className="md:col-span-2">
                  <CheckoutField
                    label="Full address"
                    required
                    error={errors.shippingAddress?.addressLine?.message}
                  >
                    <textarea
                      {...register("shippingAddress.addressLine")}
                      rows={3}
                      placeholder="Street name, building details, and complete delivery address"
                      className={inputClassName}
                    />
                  </CheckoutField>
                </div>

                <div className="md:col-span-2">
                  <CheckoutField
                    label="Nearby landmark"
                    error={errors.shippingAddress?.landmark?.message}
                  >
                    <input
                      {...register("shippingAddress.landmark")}
                      placeholder="Optional but helpful for delivery"
                      className={inputClassName}
                    />
                  </CheckoutField>
                </div>
              </div>
            </section>

            {offers.length ? (
              <section className="rounded-[2rem] border border-[#ead9d2] bg-white/85 p-6 shadow-sm md:p-8">
                <AppliedOffersBox
                  offers={offers}
                  totalSavings={offerDiscount}
                />
              </section>
            ) : null}

            <section className="rounded-[2rem] border border-[#ead9d2] bg-white/85 p-6 shadow-sm md:p-8">
              <DiscountCodeBox
                value={discountCode}
                onApply={handleApplyDiscount}
                onRemove={clearDiscountCode}
                isChecking={pricingQuery.isFetching}
                result={pricing}
                error={
                  discountError || pricingRequestError
                }
              />
            </section>

            <section className="rounded-[2rem] border border-[#ead9d2] bg-white/85 p-6 shadow-sm md:p-8">
              <div className="flex items-start gap-4">
                <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-[#f4e5df] text-[#7b584d]">
                  <ShieldCheck size={22} />
                </div>

                <div>
                  <h2 className="text-2xl font-semibold tracking-[-0.03em] text-[#2c1f1b]">
                    Payment method
                  </h2>

                  <p className="mt-1 text-sm leading-6 text-[#806a62]">
                    Available methods come directly from the secure store configuration.
                  </p>
                </div>
              </div>

              <div className="mt-7 grid gap-3">
                <PaymentMethodCard
                  value="cod"
                  selectedValue={selectedPaymentMethod}
                  label={paymentMethods.cod.label}
                  description="Pay the delivery representative when the order arrives."
                  disabled={!paymentMethods.cod.enabled}
                  onChange={(value) =>
                    setValue("paymentMethod", value, {
                      shouldValidate: true
                    })
                  }
                />

                <PaymentMethodCard
                  value="instapay"
                  selectedValue={selectedPaymentMethod}
                  label={paymentMethods.instapay.label}
                  description={
                    paymentMethods.instapay.enabled
                      ? `Transfer to ${paymentMethods.instapay.handle}, then upload the transfer screenshot.`
                      : "This method will appear after the InstaPay address is configured."
                  }
                  disabled={!paymentMethods.instapay.enabled}
                  badge={
                    paymentMethods.instapay.enabled
                      ? "Manual review"
                      : "Coming soon"
                  }
                  onChange={(value) =>
                    setValue("paymentMethod", value, {
                      shouldValidate: true
                    })
                  }
                />

                <PaymentMethodCard
                  value="vodafone_cash"
                  selectedValue={selectedPaymentMethod}
                  label={paymentMethods.vodafoneCash.label}
                  description={
                    paymentMethods.vodafoneCash.enabled
                      ? `Transfer to ${paymentMethods.vodafoneCash.number}, then upload the transfer screenshot.`
                      : "This method will appear after the Vodafone Cash number is configured."
                  }
                  disabled={!paymentMethods.vodafoneCash.enabled}
                  badge={
                    paymentMethods.vodafoneCash.enabled
                      ? "Manual review"
                      : "Coming soon"
                  }
                  onChange={(value) =>
                    setValue("paymentMethod", value, {
                      shouldValidate: true
                    })
                  }
                />

                <PaymentMethodCard
                  value="card"
                  selectedValue={selectedPaymentMethod}
                  label={paymentMethods.card.label}
                  description={
                    paymentMethods.card.enabled
                      ? "You will be redirected to Paymob’s secure hosted card page after the order is created."
                      : "Card payment will become available after Paymob configuration."
                  }
                  disabled={!paymentMethods.card.enabled}
                  badge={
                    paymentMethods.card.enabled
                      ? "Secure"
                      : "Coming soon"
                  }
                  onChange={(value) =>
                    setValue("paymentMethod", value, {
                      shouldValidate: true
                    })
                  }
                />
              </div>

              {manualPaymentSelected ? (
                <div className="mt-6 rounded-3xl border border-[#ead9d2] bg-[#fffaf7] p-5">
                  <div className="mb-5 rounded-2xl bg-white p-4">
                    <p className="text-sm text-[#806a62]">
                      Transfer the full final order amount to:
                    </p>

                    <p className="mt-2 break-all text-lg font-semibold text-[#2c1f1b]">
                      {paymentDestination}
                    </p>

                    <p className="mt-2 text-sm leading-6 text-[#806a62]">
                      Upload a clear screenshot after completing the transfer. The order will wait for admin verification.
                    </p>
                  </div>

                  <CustomerImageUploader
                    type="payment_proof"
                    value={paymentProof}
                    onChange={setPaymentProof}
                    label="Payment transfer screenshot"
                    helpText="Upload a clear screenshot showing the transferred amount and transaction details."
                    required
                  />
                </div>
              ) : null}

              {errors.paymentMethod?.message ? (
                <p className="mt-3 text-sm text-red-700">
                  {errors.paymentMethod.message}
                </p>
              ) : null}
            </section>

            <section className="rounded-[2rem] border border-[#ead9d2] bg-white/85 p-6 shadow-sm md:p-8">
              <CheckoutField
                label="Additional order note"
                error={errors.customerNote?.message}
              >
                <textarea
                  {...register("customerNote")}
                  rows={4}
                  placeholder="Delivery timing, custom request, or anything Tap & Wrap should know..."
                  className={inputClassName}
                />
              </CheckoutField>
            </section>
          </div>

          <aside className="h-fit lg:sticky lg:top-28">
            <div className="rounded-[2rem] border border-[#ead9d2] bg-white/90 p-6 shadow-sm">
              <div className="flex items-center gap-3 border-b border-[#ead9d2] pb-5">
                <PackageCheck
                  size={23}
                  className="text-[#7b584d]"
                />

                <h2 className="text-2xl font-semibold tracking-[-0.03em] text-[#2c1f1b]">
                  Order summary
                </h2>
              </div>

              <div className="mt-5 grid max-h-80 gap-4 overflow-y-auto pr-1">
                {items.map((item) => {
                  const imageUrl = item.product?.mainImage?.url || "";

                  const productPrice = Number(
                    item.product?.currentPrice ||
                      item.product?.salePrice ||
                      item.product?.price ||
                      0
                  );

                  return (
                    <article
                      key={item.id}
                      className="flex gap-4"
                    >
                      <div className="h-20 w-20 shrink-0 overflow-hidden rounded-2xl bg-[#f4e5df]">
                        {imageUrl ? (
                          <img
                            src={imageUrl}
                            alt={item.product.name}
                            className="h-full w-full object-cover"
                          />
                        ) : (
                          <div className="flex h-full items-center justify-center px-2 text-center text-xs font-semibold text-[#8a675c]">
                            Tap & Wrap
                          </div>
                        )}
                      </div>

                      <div className="min-w-0 flex-1">
                        <Link
                          to={`/products/${item.product.slug}`}
                          className="line-clamp-2 font-semibold text-[#2c1f1b] hover:text-[#5a3d34]"
                        >
                          {item.product.name}
                        </Link>

                        <p className="mt-1 text-sm text-[#806a62]">
                          Quantity: {item.quantity}
                        </p>

                        <p className="mt-1 text-sm font-semibold text-[#4b332b]">
                          {formatPrice(productPrice)}
                        </p>

                        <div className="mt-2 flex flex-wrap gap-1.5">
                          {item.engraving?.enabled ? (
                            <span className="rounded-full bg-[#f4e5df] px-2.5 py-1 text-xs font-semibold text-[#7b584d]">
                              Engraving
                            </span>
                          ) : null}

                          {item.wrapping?.enabled ? (
                            <span className="rounded-full bg-[#fff4ef] px-2.5 py-1 text-xs font-semibold text-[#7b584d]">
                              Wrapping
                            </span>
                          ) : null}
                        </div>
                      </div>
                    </article>
                  );
                })}
              </div>

              <div className="mt-6 grid gap-4 border-t border-[#ead9d2] pt-5 text-sm">
                <div className="flex justify-between gap-4 text-[#735f58]">
                  <span>Cart subtotal</span>

                  <span className="font-semibold text-[#2c1f1b]">
                    {formatPrice(subtotal)}
                  </span>
                </div>

                <div className="flex justify-between gap-4 text-[#735f58]">
                  <span>Delivery</span>

                  <span className="font-semibold text-[#2c1f1b]">
                    {governorate
                      ? formatPrice(shippingFee)
                      : "Choose governorate"}
                  </span>
                </div>

                {offerDiscount > 0 ? (
                  <div className="flex justify-between gap-4 text-green-700">
                    <span>Automatic offers</span>

                    <span className="font-semibold">
                      - {formatPrice(offerDiscount)}
                    </span>
                  </div>
                ) : null}

                {discountCode ? (
                  <div className="flex justify-between gap-4 text-green-700">
                    <span>
                      Discount code
                      {pricing?.discount?.code
                        ? ` (${pricing.discount.code})`
                        : ""}
                    </span>

                    <span className="font-semibold">
                      - {formatPrice(codeDiscount)}
                    </span>
                  </div>
                ) : null}

                <div className="flex justify-between gap-4 border-t border-[#ead9d2] pt-4">
                  <span className="text-lg font-semibold text-[#2c1f1b]">
                    Final total
                  </span>

                  <span className="text-xl font-semibold text-[#2c1f1b]">
                    {formatPrice(grandTotal)}
                  </span>
                </div>
              </div>

              <div className="mt-5 rounded-2xl bg-[#fff8f4] p-4 text-sm leading-6 text-[#735f58]">
                <div className="flex gap-3">
                  <LockKeyhole
                    size={18}
                    className="mt-0.5 shrink-0 text-[#7b584d]"
                  />

                  <p>
                    Product prices, stock, customizations, bundle allocations, code limits, uploads, and delivery are verified again inside one secure server transaction.
                  </p>
                </div>
              </div>

              {pricingRequestError ? (
                <div className="mt-4 flex gap-3 rounded-2xl border border-red-200 bg-red-50 p-4 text-sm text-red-800">
                  <AlertCircle
                    size={18}
                    className="mt-0.5 shrink-0"
                  />

                  <p>{pricingRequestError}</p>
                </div>
              ) : null}

              {orderMutation.isError ? (
                <div className="mt-4 flex gap-3 rounded-2xl border border-red-200 bg-red-50 p-4 text-sm text-red-800">
                  <AlertCircle
                    size={18}
                    className="mt-0.5 shrink-0"
                  />

                  <p>
                    {getOrderErrorMessage(orderMutation.error)}
                  </p>
                </div>
              ) : null}

              <button
                type="submit"
                disabled={
                  orderMutation.isPending ||
                  pricingQuery.isFetching ||
                  Boolean(discountCode && discountError)
                }
                className="mt-6 flex w-full items-center justify-center gap-2 rounded-full bg-[#2c1f1b] px-7 py-4 text-sm font-semibold text-white transition hover:bg-[#4b332b] disabled:cursor-not-allowed disabled:opacity-65"
              >
                {orderMutation.isPending ? (
                  <>
                    <LoaderCircle
                      size={18}
                      className="animate-spin"
                    />
                    Placing order...
                  </>
                ) : pricingQuery.isFetching ? (
                  <>
                    <LoaderCircle
                      size={18}
                      className="animate-spin"
                    />
                    Checking price...
                  </>
                ) : (
                  <>
                    <CheckCircle2 size={18} />

                    {selectedPaymentMethod ===
                    "card"
                      ? "Continue to secure payment"
                      : "Place order"}
                  </>
                )}
              </button>

              <div className="mt-4 flex items-center justify-center gap-2 text-xs text-[#806a62]">
                <Truck size={14} />
                <span>
                  Cairo & Giza {formatPrice(config.shipping.cairoAndGiza)} · Other areas {formatPrice(config.shipping.otherGovernorates)}
                </span>
              </div>
            </div>
          </aside>
        </form>
      </main>

      <Footer />
    </>
  );
}
