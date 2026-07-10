import {
  useState
} from "react";
import {
  Check,
  CheckCircle2,
  Circle,
  Clock3,
  ExternalLink,
  LoaderCircle,
  Mail,
  MapPin,
  Package,
  PackageCheck,
  Search,
  ShoppingBag,
  Sparkles,
  Truck,
  XCircle
} from "lucide-react";
import {
  Link
} from "react-router-dom";
import {
  useMutation
} from "@tanstack/react-query";
import {
  useForm
} from "react-hook-form";
import {
  zodResolver
} from "@hookform/resolvers/zod";
import { z } from "zod";

import Header from "../components/layout/Header";
import Footer from "../components/layout/Footer";

import {
  getTrackingErrorMessage,
  trackOrder
} from "../features/orders/orderTrackingApi";

import {
  formatPrice
} from "../utils/cartUtils";

const trackingSchema = z.object({
  orderNumber: z
    .string()
    .trim()
    .min(
      5,
      "Enter your order number"
    ),

  email: z
    .string()
    .trim()
    .email(
      "Enter the same email used during checkout"
    )
});

const inputClassName =
  "w-full rounded-2xl border border-[#ead9d2] bg-white px-4 py-3.5 text-[#2c1f1b] outline-none transition placeholder:text-[#b09a92] focus:border-[#8a675c] focus:ring-4 focus:ring-[#ead9d2]/45";

const orderStatusLabels = {
  pending: "Order received",
  confirmed: "Confirmed",
  preparing: "Preparing",
  ready: "Ready",
  out_for_delivery:
    "Out for delivery",
  delivered: "Delivered",
  cancelled: "Cancelled"
};

const paymentMethodLabels = {
  cod: "Cash on Delivery",
  instapay: "InstaPay",
  vodafone_cash:
    "Vodafone Cash",
  card: "Card"
};

const paymentStatusLabels = {
  unpaid: "Unpaid",
  pending_review:
    "Payment under review",
  paid: "Paid",
  failed: "Payment failed",
  refunded: "Refunded"
};

const fulfilmentSteps = [
  {
    status: "pending",
    label: "Order received",
    description:
      "Your order has reached Tap & Wrap.",
    icon: ShoppingBag
  },
  {
    status: "confirmed",
    label: "Confirmed",
    description:
      "The order details have been reviewed.",
    icon: CheckCircle2
  },
  {
    status: "preparing",
    label: "Preparing",
    description:
      "Your products and customizations are being prepared.",
    icon: Sparkles
  },
  {
    status: "ready",
    label: "Ready",
    description:
      "Your order is packed and ready.",
    icon: PackageCheck
  },
  {
    status: "out_for_delivery",
    label: "Out for delivery",
    description:
      "The order is on its way.",
    icon: Truck
  },
  {
    status: "delivered",
    label: "Delivered",
    description:
      "Your order has been delivered.",
    icon: Check
  }
];

function formatDate(value) {
  if (!value) {
    return "—";
  }

  return new Intl.DateTimeFormat(
    "en-EG",
    {
      dateStyle: "medium",
      timeStyle: "short"
    }
  ).format(new Date(value));
}

function getStatusDate(
  order,
  status
) {
  if (status === "pending") {
    return order.createdAt;
  }

  const entry = [
    ...(order.statusHistory || [])
  ]
    .reverse()
    .find(
      (item) =>
        item.status === status
    );

  return entry?.changedAt || null;
}

function OrderTimeline({
  order
}) {
  if (
    order.status ===
    "cancelled"
  ) {
    const cancellationDate =
      getStatusDate(
        order,
        "cancelled"
      );

    return (
      <div className="rounded-3xl border border-red-200 bg-red-50 p-6 text-red-800">
        <div className="flex items-start gap-4">
          <XCircle
            size={27}
            className="mt-0.5 shrink-0"
          />

          <div>
            <h3 className="text-lg font-semibold">
              Order cancelled
            </h3>

            <p className="mt-2 leading-7">
              This order is no longer
              moving through fulfilment.
              Contact Tap & Wrap when you
              need more information.
            </p>

            {cancellationDate ? (
              <p className="mt-3 text-sm font-semibold">
                {formatDate(
                  cancellationDate
                )}
              </p>
            ) : null}
          </div>
        </div>
      </div>
    );
  }

  const currentIndex =
    fulfilmentSteps.findIndex(
      (step) =>
        step.status ===
        order.status
    );

  return (
    <div className="grid gap-3">
      {fulfilmentSteps.map(
        (step, index) => {
          const Icon = step.icon;

          const completed =
            index < currentIndex;

          const current =
            index === currentIndex;

          const reached =
            completed || current;

          const statusDate =
            getStatusDate(
              order,
              step.status
            );

          return (
            <article
              key={step.status}
              className={`relative flex gap-4 rounded-3xl border p-5 transition ${
                current
                  ? "border-[#8a675c] bg-[#fff8f4]"
                  : completed
                    ? "border-green-200 bg-green-50/50"
                    : "border-[#ead9d2] bg-white"
              }`}
            >
              <div
                className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-full ${
                  current
                    ? "bg-[#2c1f1b] text-white"
                    : completed
                      ? "bg-green-100 text-green-700"
                      : "bg-[#f4e5df] text-[#a98a7f]"
                }`}
              >
                {completed ? (
                  <Check size={19} />
                ) : reached ? (
                  <Icon size={19} />
                ) : (
                  <Circle size={17} />
                )}
              </div>

              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <h3 className="font-semibold text-[#2c1f1b]">
                    {step.label}
                  </h3>

                  {current ? (
                    <span className="rounded-full bg-[#2c1f1b] px-2.5 py-1 text-xs font-semibold text-white">
                      Current
                    </span>
                  ) : null}
                </div>

                <p className="mt-1 text-sm leading-6 text-[#806a62]">
                  {step.description}
                </p>

                {statusDate ? (
                  <p className="mt-2 text-xs font-semibold text-[#735f58]">
                    {formatDate(
                      statusDate
                    )}
                  </p>
                ) : null}
              </div>
            </article>
          );
        }
      )}
    </div>
  );
}

function OrderItem({
  item
}) {
  return (
    <article className="grid gap-4 rounded-3xl border border-[#ead9d2] bg-[#faf7f5] p-4 sm:grid-cols-[90px_1fr_auto]">
      <div className="aspect-square overflow-hidden rounded-2xl bg-[#f4e5df]">
        {item.productImage ? (
          <img
            src={item.productImage}
            alt={item.productName}
            className="h-full w-full object-cover"
          />
        ) : (
          <div className="flex h-full items-center justify-center text-xs font-semibold text-[#8a675c]">
            T&W
          </div>
        )}
      </div>

      <div>
        <Link
          to={`/products/${item.productSlug}`}
          className="font-semibold text-[#2c1f1b] transition hover:text-[#7b584d]"
        >
          {item.productName}
        </Link>

        <p className="mt-1 text-sm text-[#806a62]">
          Quantity: {item.quantity}
        </p>

        {item.engraving?.enabled ? (
          <div className="mt-3 rounded-2xl bg-white p-3 text-sm leading-6 text-[#735f58]">
            <p className="font-semibold text-[#2c1f1b]">
              Engraving
            </p>

            <p className="mt-1 capitalize">
              Type:{" "}
              {item.engraving.type}
            </p>

            {item.engraving.text ? (
              <p>
                Text:{" "}
                {item.engraving.text}
              </p>
            ) : null}

            {item.engraving.placement ? (
              <p>
                Placement:{" "}
                {
                  item.engraving
                    .placement
                }
              </p>
            ) : null}

            {item.engraving
              .hasUploadedImage ? (
              <p>
                Custom image uploaded
              </p>
            ) : null}
          </div>
        ) : null}

        {item.wrapping?.enabled ? (
          <div className="mt-3 rounded-2xl bg-white p-3 text-sm leading-6 text-[#735f58]">
            <p className="font-semibold text-[#2c1f1b]">
              Gift wrapping
            </p>

            {item.wrapping.boxColor ? (
              <p className="mt-1">
                Box:{" "}
                {item.wrapping.boxColor}
              </p>
            ) : null}

            {item.wrapping
              .ribbonColor ? (
              <p>
                Ribbon:{" "}
                {
                  item.wrapping
                    .ribbonColor
                }
              </p>
            ) : null}

            {item.wrapping.giftCard ? (
              <p>
                Gift card included
              </p>
            ) : null}

            {item.wrapping.textOnBox ? (
              <p>
                Box text included
              </p>
            ) : null}

            {item.wrapping.fillers ? (
              <p>Fillers included</p>
            ) : null}
          </div>
        ) : null}
      </div>

      <p className="font-semibold text-[#2c1f1b] sm:text-right">
        {formatPrice(
          item.lineTotal
        )}
      </p>
    </article>
  );
}

export default function TrackOrderPage() {
  const [
    trackedOrder,
    setTrackedOrder
  ] = useState(null);

  const {
    register,
    handleSubmit,
    reset,
    formState: {
      errors
    }
  } = useForm({
    resolver:
      zodResolver(
        trackingSchema
      ),

    defaultValues: {
      orderNumber: "",
      email: ""
    }
  });

  const mutation = useMutation({
    mutationFn:
      trackOrder,

    onSuccess(response) {
      setTrackedOrder(
        response.order
      );

      window.scrollTo({
        top: 0,
        behavior: "smooth"
      });
    }
  });

  function submitTracking(
    values
  ) {
    mutation.mutate({
      orderNumber:
        values.orderNumber
          .trim()
          .toUpperCase(),

      email:
        values.email
          .trim()
          .toLowerCase()
    });
  }

  function startAgain() {
    setTrackedOrder(null);
    mutation.reset();
    reset();
  }

  return (
    <>
      <Header />

      <main>
        <section className="bg-[#fff8f4] px-5 py-16 md:py-24">
          <div className="mx-auto max-w-7xl">
            <p className="text-sm font-semibold uppercase tracking-[0.25em] text-[#b08a7c]">
              Order updates
            </p>

            <h1 className="mt-4 max-w-4xl text-5xl font-semibold tracking-[-0.05em] text-[#2c1f1b] md:text-7xl">
              Track your Tap & Wrap order.
            </h1>

            <p className="mt-6 max-w-2xl text-lg leading-8 text-[#735f58]">
              Enter the order number and
              the same email address used
              during checkout.
            </p>
          </div>
        </section>

        <section className="mx-auto max-w-6xl px-5 py-14">
          {!trackedOrder ? (
            <div className="mx-auto max-w-2xl rounded-[2rem] border border-[#ead9d2] bg-white p-7 shadow-sm md:p-10">
              <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-[#f4e5df] text-[#7b584d]">
                <Package size={27} />
              </div>

              <h2 className="mt-6 text-3xl font-semibold tracking-[-0.04em] text-[#2c1f1b]">
                Find your order
              </h2>

              <form
                onSubmit={handleSubmit(
                  submitTracking
                )}
                className="mt-7 grid gap-5"
              >
                <label className="grid gap-2">
                  <span className="text-sm font-semibold text-[#2c1f1b]">
                    Order number
                  </span>

                  <input
                    {...register(
                      "orderNumber"
                    )}
                    placeholder="TW-20260710-0001"
                    className={`${inputClassName} uppercase`}
                  />

                  {errors.orderNumber
                    ?.message ? (
                    <span className="text-sm text-red-700">
                      {
                        errors
                          .orderNumber
                          .message
                      }
                    </span>
                  ) : null}
                </label>

                <label className="grid gap-2">
                  <span className="text-sm font-semibold text-[#2c1f1b]">
                    Checkout email
                  </span>

                  <div className="relative">
                    <Mail
                      size={17}
                      className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-[#9a8178]"
                    />

                    <input
                      {...register(
                        "email"
                      )}
                      type="email"
                      placeholder="you@example.com"
                      className={`${inputClassName} pl-11`}
                    />
                  </div>

                  {errors.email
                    ?.message ? (
                    <span className="text-sm text-red-700">
                      {
                        errors.email
                          .message
                      }
                    </span>
                  ) : null}
                </label>

                {mutation.isError ? (
                  <div className="rounded-2xl border border-red-200 bg-red-50 p-4 text-sm leading-6 text-red-800">
                    {getTrackingErrorMessage(
                      mutation.error
                    )}
                  </div>
                ) : null}

                <button
                  type="submit"
                  disabled={
                    mutation.isPending
                  }
                  className="flex items-center justify-center gap-2 rounded-full bg-[#2c1f1b] px-7 py-4 text-sm font-semibold text-white transition hover:bg-[#4b332b] disabled:opacity-60"
                >
                  {mutation.isPending ? (
                    <>
                      <LoaderCircle
                        size={18}
                        className="animate-spin"
                      />
                      Finding order...
                    </>
                  ) : (
                    <>
                      <Search size={18} />
                      Track order
                    </>
                  )}
                </button>
              </form>
            </div>
          ) : (
            <div>
              <div className="flex flex-col justify-between gap-5 lg:flex-row lg:items-end">
                <div>
                  <p className="text-sm font-semibold uppercase tracking-[0.22em] text-[#a77d70]">
                    Order found
                  </p>

                  <h2 className="mt-2 text-4xl font-semibold tracking-[-0.04em] text-[#2c1f1b]">
                    {
                      trackedOrder.orderNumber
                    }
                  </h2>

                  <p className="mt-3 text-[#735f58]">
                    Placed{" "}
                    {formatDate(
                      trackedOrder.createdAt
                    )}
                  </p>
                </div>

                <div className="flex flex-wrap gap-2">
                  <span className="rounded-full bg-[#2c1f1b] px-4 py-2 text-sm font-semibold text-white">
                    {
                      orderStatusLabels[
                        trackedOrder.status
                      ] ||
                      trackedOrder.status
                    }
                  </span>

                  <button
                    type="button"
                    onClick={startAgain}
                    className="rounded-full border border-[#ead9d2] bg-white px-5 py-2 text-sm font-semibold text-[#5a3d34]"
                  >
                    Track another order
                  </button>
                </div>
              </div>

              <section className="mt-8 grid gap-6 xl:grid-cols-[1fr_380px]">
                <div className="grid gap-6">
                  <article className="rounded-[2rem] border border-[#ead9d2] bg-white p-6 shadow-sm md:p-8">
                    <div className="flex items-center gap-3">
                      <Clock3
                        size={22}
                        className="text-[#8a675c]"
                      />

                      <h3 className="text-2xl font-semibold text-[#2c1f1b]">
                        Order progress
                      </h3>
                    </div>

                    <div className="mt-6">
                      <OrderTimeline
                        order={
                          trackedOrder
                        }
                      />
                    </div>
                  </article>

                  <article className="rounded-[2rem] border border-[#ead9d2] bg-white p-6 shadow-sm md:p-8">
                    <h3 className="text-2xl font-semibold text-[#2c1f1b]">
                      Items
                    </h3>

                    <div className="mt-6 grid gap-4">
                      {trackedOrder.items.map(
                        (item) => (
                          <OrderItem
                            key={
                              item._id
                            }
                            item={item}
                          />
                        )
                      )}
                    </div>
                  </article>
                </div>

                <aside className="h-fit space-y-5 xl:sticky xl:top-28">
                  <article className="rounded-[2rem] border border-[#ead9d2] bg-white p-6 shadow-sm">
                    <h3 className="text-xl font-semibold text-[#2c1f1b]">
                      Order summary
                    </h3>

                    <div className="mt-6 grid gap-4 text-sm">
                      <div className="flex justify-between gap-4 text-[#735f58]">
                        <span>Subtotal</span>

                        <strong className="text-[#2c1f1b]">
                          {formatPrice(
                            trackedOrder
                              .totals
                              .subtotal
                          )}
                        </strong>
                      </div>

                      <div className="flex justify-between gap-4 text-[#735f58]">
                        <span>Delivery</span>

                        <strong className="text-[#2c1f1b]">
                          {formatPrice(
                            trackedOrder
                              .totals
                              .shippingFee
                          )}
                        </strong>
                      </div>

                      {Number(
                        trackedOrder
                          .totals
                          .offerDiscount ||
                          0
                      ) > 0 ? (
                        <div className="flex justify-between gap-4 text-green-700">
                          <span>
                            Bundle offers
                          </span>

                          <strong>
                            -{" "}
                            {formatPrice(
                              trackedOrder
                                .totals
                                .offerDiscount
                            )}
                          </strong>
                        </div>
                      ) : null}

                      {Number(
                        trackedOrder
                          .totals
                          .codeDiscount ||
                          0
                      ) > 0 ? (
                        <div className="flex justify-between gap-4 text-green-700">
                          <span>
                            Discount code
                          </span>

                          <strong>
                            -{" "}
                            {formatPrice(
                              trackedOrder
                                .totals
                                .codeDiscount
                            )}
                          </strong>
                        </div>
                      ) : null}

                      {!trackedOrder
                        .totals
                        .offerDiscount &&
                      !trackedOrder
                        .totals
                        .codeDiscount &&
                      Number(
                        trackedOrder
                          .totals
                          .discount || 0
                      ) > 0 ? (
                        <div className="flex justify-between gap-4 text-green-700">
                          <span>
                            Discount
                          </span>

                          <strong>
                            -{" "}
                            {formatPrice(
                              trackedOrder
                                .totals
                                .discount
                            )}
                          </strong>
                        </div>
                      ) : null}

                      <div className="flex justify-between gap-4 border-t border-[#ead9d2] pt-5 text-lg">
                        <span className="font-semibold text-[#2c1f1b]">
                          Total
                        </span>

                        <strong className="text-[#2c1f1b]">
                          {formatPrice(
                            trackedOrder
                              .totals
                              .grandTotal
                          )}
                        </strong>
                      </div>
                    </div>
                  </article>

                  <article className="rounded-[2rem] border border-[#ead9d2] bg-white p-6 shadow-sm">
                    <h3 className="text-xl font-semibold text-[#2c1f1b]">
                      Payment
                    </h3>

                    <div className="mt-5 grid gap-3 text-sm text-[#735f58]">
                      <p>
                        Method:{" "}
                        <strong className="text-[#2c1f1b]">
                          {paymentMethodLabels[
                            trackedOrder
                              .payment
                              .method
                          ] ||
                            trackedOrder
                              .payment
                              .method}
                        </strong>
                      </p>

                      <p>
                        Status:{" "}
                        <strong className="text-[#2c1f1b]">
                          {paymentStatusLabels[
                            trackedOrder
                              .payment
                              .status
                          ] ||
                            trackedOrder
                              .payment
                              .status}
                        </strong>
                      </p>
                    </div>
                  </article>

                  <article className="rounded-[2rem] border border-[#ead9d2] bg-white p-6 shadow-sm">
                    <div className="flex items-center gap-3">
                      <MapPin
                        size={21}
                        className="text-[#8a675c]"
                      />

                      <h3 className="text-xl font-semibold text-[#2c1f1b]">
                        Delivery destination
                      </h3>
                    </div>

                    <p className="mt-4 leading-7 text-[#735f58]">
                      {[
                        trackedOrder
                          .shippingDestination
                          .area,

                        trackedOrder
                          .shippingDestination
                          .city,

                        trackedOrder
                          .shippingDestination
                          .governorate
                      ]
                        .filter(Boolean)
                        .join(", ")}
                    </p>
                  </article>

                  <a
                    href="https://wa.me/201508216472"
                    target="_blank"
                    rel="noreferrer"
                    className="flex items-center justify-center gap-2 rounded-full border border-[#ead9d2] bg-white px-6 py-3.5 text-sm font-semibold text-[#5a3d34]"
                  >
                    Need help on WhatsApp
                    <ExternalLink
                      size={15}
                    />
                  </a>
                </aside>
              </section>
            </div>
          )}
        </section>
      </main>

      <Footer />
    </>
  );
}