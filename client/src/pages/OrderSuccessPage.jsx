import {
  useMemo,
  useState
} from "react";
import {
  Link,
  useLocation,
  useParams
} from "react-router-dom";
import {
  CheckCircle2,
  Clock3,
  CreditCard,
  Home,
  LoaderCircle,
  MessageCircle,
  PackageCheck,
  ReceiptText,
  RefreshCw
} from "lucide-react";
import {
  useMutation
} from "@tanstack/react-query";
import toast from "react-hot-toast";

import Header from "../components/layout/Header";
import Footer from "../components/layout/Footer";

import {
  getOrderErrorMessage,
  retryCardPayment
} from "../features/orders/orderApi";

import {
  formatPrice
} from "../utils/cartUtils";

function readSavedOrder() {
  try {
    const savedOrder =
      sessionStorage.getItem(
        "tap_wrap_last_order"
      );

    return savedOrder
      ? JSON.parse(savedOrder)
      : null;
  } catch {
    return null;
  }
}

function getPaymentLabel(
  method
) {
  const labels = {
    cod:
      "Cash on Delivery",

    instapay:
      "InstaPay",

    vodafone_cash:
      "Vodafone Cash",

    card:
      "Visa / Mastercard"
  };

  return (
    labels[method] ||
    method ||
    "Not available"
  );
}

export default function OrderSuccessPage() {
  const {
    orderNumber
  } = useParams();

  const location =
    useLocation();

  const order =
    useMemo(() => {
      const locationOrder =
        location.state?.order;

      if (
        locationOrder
          ?.orderNumber ===
        orderNumber
      ) {
        return locationOrder;
      }

      const savedOrder =
        readSavedOrder();

      if (
        savedOrder
          ?.orderNumber ===
        orderNumber
      ) {
        return savedOrder;
      }

      return null;
    }, [
      location.state,
      orderNumber
    ]);

  const [
    cardEmail,
    setCardEmail
  ] = useState(
    () =>
      sessionStorage.getItem(
        "tap_wrap_last_card_email"
      ) || ""
  );

  const retryMutation =
    useMutation({
      mutationFn:
        retryCardPayment,

      onSuccess(response) {
        const redirectUrl =
          response.payment
            ?.redirectUrl;

        if (!redirectUrl) {
          toast.error(
            "The secure payment page could not be opened."
          );

          return;
        }

        window.location.assign(
          redirectUrl
        );
      },

      onError(error) {
        toast.error(
          getOrderErrorMessage(
            error
          )
        );
      }
    });

  const paymentNeedsReview =
    order?.paymentStatus ===
    "pending_review";

  const cardPaymentNeedsRetry =
    order?.paymentMethod ===
      "card" &&
    order?.paymentFlow
      ?.initialized === false;

  function retryPayment(
    event
  ) {
    event.preventDefault();

    const email =
      cardEmail
        .trim()
        .toLowerCase();

    if (
      !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(
        email
      )
    ) {
      toast.error(
        "Enter the same email used during checkout."
      );

      return;
    }

    sessionStorage.setItem(
      "tap_wrap_last_card_email",
      email
    );

    retryMutation.mutate({
      orderNumber,
      email
    });
  }

  return (
    <>
      <Header />

      <main className="mx-auto max-w-4xl px-5 py-16">
        <section className="overflow-hidden rounded-[2.2rem] border border-[#ead9d2] bg-white/90 shadow-xl shadow-[#4b332b]/10">
          <div className="bg-[#2c1f1b] px-7 py-12 text-center text-white md:px-12">
            <div className="mx-auto flex h-20 w-20 items-center justify-center rounded-full bg-white/10">
              <CheckCircle2
                size={42}
              />
            </div>

            <p className="mt-6 text-sm font-semibold uppercase tracking-[0.3em] text-[#e6c9bf]">
              Order received
            </p>

            <h1 className="mt-3 text-4xl font-semibold tracking-[-0.04em] md:text-5xl">
              Thank you for choosing
              Tap & Wrap.
            </h1>

            <p className="mx-auto mt-4 max-w-2xl leading-7 text-white/70">
              Your gift order has been
              created successfully. Keep
              the order number below for
              questions or updates.
            </p>
          </div>

          <div className="p-7 md:p-10">
            <div className="rounded-3xl border border-[#ead9d2] bg-[#fffaf7] p-6 text-center">
              <p className="text-sm font-semibold uppercase tracking-[0.22em] text-[#9a766b]">
                Order number
              </p>

              <p className="mt-3 break-all text-3xl font-semibold tracking-[-0.03em] text-[#2c1f1b]">
                {orderNumber}
              </p>
            </div>

            {order ? (
              <div className="mt-6 grid gap-4 sm:grid-cols-2">
                <div className="rounded-3xl border border-[#ead9d2] bg-white p-5">
                  <ReceiptText
                    size={23}
                    className="text-[#8a675c]"
                  />

                  <p className="mt-4 text-sm text-[#806a62]">
                    Payment method
                  </p>

                  <p className="mt-1 font-semibold text-[#2c1f1b]">
                    {getPaymentLabel(
                      order.paymentMethod
                    )}
                  </p>
                </div>

                <div className="rounded-3xl border border-[#ead9d2] bg-white p-5">
                  <PackageCheck
                    size={23}
                    className="text-[#8a675c]"
                  />

                  <p className="mt-4 text-sm text-[#806a62]">
                    Order total
                  </p>

                  <p className="mt-1 text-xl font-semibold text-[#2c1f1b]">
                    {formatPrice(
                      order.totals
                        ?.grandTotal
                    )}
                  </p>
                </div>
              </div>
            ) : null}

            <div className="mt-6 flex gap-4 rounded-3xl border border-[#ead9d2] bg-[#fff8f4] p-5">
              <Clock3
                size={23}
                className="mt-0.5 shrink-0 text-[#8a675c]"
              />

              <div>
                <h2 className="font-semibold text-[#2c1f1b]">
                  What happens next?
                </h2>

                <p className="mt-2 leading-7 text-[#735f58]">
                  Tap & Wrap will review
                  the order,
                  customization details,
                  stock, and delivery
                  information before
                  preparation begins.
                </p>
              </div>
            </div>

            {paymentNeedsReview ? (
              <div className="mt-4 rounded-3xl border border-[#ead9d2] bg-white p-5">
                <h2 className="font-semibold text-[#2c1f1b]">
                  Payment verification
                  required
                </h2>

                <p className="mt-2 leading-7 text-[#735f58]">
                  Your transfer screenshot
                  was uploaded and the
                  payment is waiting for
                  admin verification.
                </p>
              </div>
            ) : null}

            {cardPaymentNeedsRetry ? (
              <form
                onSubmit={
                  retryPayment
                }
                className="mt-4 rounded-3xl border border-amber-200 bg-amber-50 p-5"
              >
                <div className="flex items-start gap-3 text-amber-950">
                  <CreditCard
                    size={23}
                    className="mt-0.5 shrink-0"
                  />

                  <div>
                    <h2 className="font-semibold">
                      Card payment still
                      required
                    </h2>

                    <p className="mt-2 leading-7 text-amber-900/80">
                      Your order was saved,
                      but the secure Paymob
                      page could not be
                      opened. Retry here
                      without creating
                      another order.
                    </p>
                  </div>
                </div>

                <input
                  type="email"
                  value={cardEmail}
                  onChange={(
                    event
                  ) =>
                    setCardEmail(
                      event.target
                        .value
                    )
                  }
                  placeholder="Checkout email"
                  className="mt-4 w-full rounded-2xl border border-amber-200 bg-white px-4 py-3.5 outline-none"
                />

                <button
                  type="submit"
                  disabled={
                    retryMutation
                      .isPending
                  }
                  className="mt-3 inline-flex w-full items-center justify-center gap-2 rounded-full bg-[#2c1f1b] px-6 py-3.5 text-sm font-semibold text-white disabled:opacity-60"
                >
                  {retryMutation.isPending ? (
                    <LoaderCircle
                      size={17}
                      className="animate-spin"
                    />
                  ) : (
                    <RefreshCw
                      size={17}
                    />
                  )}

                  Retry secure payment
                </button>
              </form>
            ) : null}

            <div className="mt-8 flex flex-col justify-center gap-3 sm:flex-row">
              <Link
                to="/"
                className="inline-flex items-center justify-center gap-2 rounded-full bg-[#2c1f1b] px-7 py-3.5 text-sm font-semibold text-white transition hover:bg-[#4b332b]"
              >
                <Home size={17} />
                Back to home
              </Link>

              <a
                href={`https://wa.me/201508216472?text=${encodeURIComponent(
                  `Hello Tap & Wrap, I am asking about order ${orderNumber}.`
                )}`}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center justify-center gap-2 rounded-full border border-[#d8bfb6] bg-white px-7 py-3.5 text-sm font-semibold text-[#4b332b] transition hover:bg-[#fff8f4]"
              >
                <MessageCircle
                  size={17}
                />

                Ask about the order
              </a>
            </div>
          </div>
        </section>
      </main>

      <Footer />
    </>
  );
}
