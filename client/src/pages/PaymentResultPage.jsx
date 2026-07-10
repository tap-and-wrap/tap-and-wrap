import {
  useMemo,
  useState
} from "react";
import {
  AlertCircle,
  CheckCircle2,
  Clock3,
  CreditCard,
  Home,
  LoaderCircle,
  RefreshCw,
  ShieldCheck
} from "lucide-react";
import {
  Link,
  useSearchParams
} from "react-router-dom";
import {
  useMutation,
  useQuery
} from "@tanstack/react-query";
import toast from "react-hot-toast";

import Header from "../components/layout/Header";
import Footer from "../components/layout/Footer";
import LoadingState from "../components/ui/LoadingState";
import ErrorState from "../components/ui/ErrorState";

import {
  getOrderErrorMessage,
  getPaymobPaymentResult,
  retryCardPayment
} from "../features/orders/orderApi";

import {
  formatPrice
} from "../utils/cartUtils";

const resultContent = {
  paid: {
    title:
      "Payment received.",

    description:
      "Your card payment was confirmed securely. Tap & Wrap can now continue processing the order.",

    icon:
      CheckCircle2,

    wrapper:
      "border-green-200 bg-green-50 text-green-800"
  },

  refunded: {
    title:
      "Payment refunded.",

    description:
      "The payment has been marked as refunded. Contact Tap & Wrap when you need more information.",

    icon:
      RefreshCw,

    wrapper:
      "border-blue-200 bg-blue-50 text-blue-800"
  },

  failed: {
    title:
      "Payment was not completed.",

    description:
      "No successful card payment was recorded. Your order still exists, so you can retry without creating it again.",

    icon:
      AlertCircle,

    wrapper:
      "border-red-200 bg-red-50 text-red-800"
  },

  unpaid: {
    title:
      "Payment is still pending.",

    description:
      "Paymob has not confirmed a successful payment yet. You can wait briefly, track the order, or retry the card payment.",

    icon:
      Clock3,

    wrapper:
      "border-amber-200 bg-amber-50 text-amber-900"
  }
};

export default function PaymentResultPage() {
  const [
    searchParams
  ] = useSearchParams();

  const queryParams =
    useMemo(
      () => ({
        orderNumber:
          searchParams.get(
            "orderNumber"
          ) || "",

        transactionId:
          searchParams.get(
            "transactionId"
          ) || "",

        status:
          searchParams.get(
            "status"
          ) || "",

        signature:
          searchParams.get(
            "signature"
          ) || ""
      }),
      [searchParams]
    );

  const [
    email,
    setEmail
  ] = useState(
    () =>
      sessionStorage.getItem(
        "tap_wrap_last_card_email"
      ) || ""
  );

  const hasCompleteResult =
    Object.values(
      queryParams
    ).every(Boolean);

  const resultQuery =
    useQuery({
      queryKey: [
        "paymob-result",
        queryParams
      ],

      queryFn: () =>
        getPaymobPaymentResult(
          queryParams
        ),

      enabled:
        hasCompleteResult,

      retry: false
    });

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

  if (!hasCompleteResult) {
    return (
      <>
        <Header />

        <main className="mx-auto max-w-3xl px-5 py-16">
          <ErrorState message="This payment-result link is incomplete or invalid." />

          <div className="mt-6 text-center">
            <Link
              to="/track-order"
              className="font-semibold text-[#5a3d34]"
            >
              Track your order instead
            </Link>
          </div>
        </main>

        <Footer />
      </>
    );
  }

  if (
    resultQuery.isLoading
  ) {
    return (
      <>
        <Header />

        <main className="mx-auto max-w-3xl px-5 py-16">
          <LoadingState label="Confirming your card payment..." />
        </main>

        <Footer />
      </>
    );
  }

  if (
    resultQuery.isError ||
    !resultQuery.data
      ?.result
  ) {
    return (
      <>
        <Header />

        <main className="mx-auto max-w-3xl px-5 py-16">
          <ErrorState message="The payment result could not be verified securely." />

          <div className="mt-6 text-center">
            <Link
              to="/track-order"
              className="font-semibold text-[#5a3d34]"
            >
              Track your order
            </Link>
          </div>
        </main>

        <Footer />
      </>
    );
  }

  const result =
    resultQuery.data.result;

  const content =
    resultContent[
      result.paymentStatus
    ] ||
    resultContent.unpaid;

  const Icon =
    content.icon;

  const mayRetry =
    ["failed", "unpaid"].includes(
      result.paymentStatus
    ) &&
    ![
      "cancelled",
      "delivered"
    ].includes(
      result.orderStatus
    );

  function handleRetry(
    event
  ) {
    event.preventDefault();

    const normalizedEmail =
      email.trim().toLowerCase();

    if (
      !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(
        normalizedEmail
      )
    ) {
      toast.error(
        "Enter the same email used during checkout."
      );

      return;
    }

    sessionStorage.setItem(
      "tap_wrap_last_card_email",
      normalizedEmail
    );

    retryMutation.mutate({
      orderNumber:
        result.orderNumber,

      email:
        normalizedEmail
    });
  }

  return (
    <>
      <Header />

      <main className="mx-auto max-w-4xl px-5 py-16">
        <section className="overflow-hidden rounded-[2.2rem] border border-[#ead9d2] bg-white shadow-xl shadow-[#4b332b]/10">
          <div className="bg-[#2c1f1b] px-7 py-10 text-center text-white md:px-12">
            <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-white/10">
              <ShieldCheck
                size={31}
              />
            </div>

            <p className="mt-5 text-sm font-semibold uppercase tracking-[0.28em] text-[#e6c9bf]">
              Secure card payment
            </p>

            <h1 className="mt-3 text-4xl font-semibold tracking-[-0.04em]">
              Paymob payment result
            </h1>
          </div>

          <div className="p-7 md:p-10">
            <div
              className={`rounded-3xl border p-6 ${content.wrapper}`}
            >
              <div className="flex items-start gap-4">
                <Icon
                  size={28}
                  className="mt-0.5 shrink-0"
                />

                <div>
                  <h2 className="text-xl font-semibold">
                    {content.title}
                  </h2>

                  <p className="mt-2 leading-7">
                    {content.description}
                  </p>
                </div>
              </div>
            </div>

            <div className="mt-6 grid gap-4 sm:grid-cols-2">
              <article className="rounded-3xl border border-[#ead9d2] bg-[#fffaf7] p-5">
                <p className="text-sm text-[#806a62]">
                  Order number
                </p>

                <p className="mt-2 break-all font-semibold text-[#2c1f1b]">
                  {result.orderNumber}
                </p>
              </article>

              <article className="rounded-3xl border border-[#ead9d2] bg-[#fffaf7] p-5">
                <p className="text-sm text-[#806a62]">
                  Order total
                </p>

                <p className="mt-2 text-xl font-semibold text-[#2c1f1b]">
                  {formatPrice(
                    result.totals
                      ?.grandTotal
                  )}
                </p>
              </article>
            </div>

            {mayRetry ? (
              <form
                onSubmit={
                  handleRetry
                }
                className="mt-6 rounded-3xl border border-[#ead9d2] bg-white p-5"
              >
                <div className="flex items-start gap-3">
                  <CreditCard
                    size={22}
                    className="mt-0.5 text-[#8a675c]"
                  />

                  <div>
                    <h2 className="font-semibold text-[#2c1f1b]">
                      Retry card payment
                    </h2>

                    <p className="mt-1 text-sm leading-6 text-[#806a62]">
                      This creates a new
                      secure Paymob session
                      for the same order.
                    </p>
                  </div>
                </div>

                <label className="mt-5 grid gap-2">
                  <span className="text-sm font-semibold text-[#2c1f1b]">
                    Checkout email
                  </span>

                  <input
                    type="email"
                    value={email}
                    onChange={(
                      event
                    ) =>
                      setEmail(
                        event.target
                          .value
                      )
                    }
                    placeholder="name@example.com"
                    className="w-full rounded-2xl border border-[#ead9d2] px-4 py-3.5 outline-none focus:border-[#8a675c]"
                  />
                </label>

                <button
                  type="submit"
                  disabled={
                    retryMutation
                      .isPending
                  }
                  className="mt-4 inline-flex w-full items-center justify-center gap-2 rounded-full bg-[#2c1f1b] px-6 py-3.5 text-sm font-semibold text-white disabled:opacity-60"
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

                  Open secure payment
                </button>
              </form>
            ) : null}

            <div className="mt-8 flex flex-col justify-center gap-3 sm:flex-row">
              <Link
                to="/track-order"
                className="inline-flex items-center justify-center rounded-full bg-[#2c1f1b] px-7 py-3.5 text-sm font-semibold text-white"
              >
                Track this order
              </Link>

              <Link
                to="/"
                className="inline-flex items-center justify-center gap-2 rounded-full border border-[#d8bfb6] px-7 py-3.5 text-sm font-semibold text-[#4b332b]"
              >
                <Home size={17} />
                Back to home
              </Link>
            </div>
          </div>
        </section>
      </main>

      <Footer />
    </>
  );
}
