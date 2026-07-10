import {
  useMemo,
  useState
} from "react";
import {
  AlertTriangle,
  Ban,
  BarChart3,
  Boxes,
  CalendarDays,
  CheckCircle2,
  CircleDollarSign,
  Clock3,
  CreditCard,
  PackageCheck,
  ShoppingBag,
  TrendingUp
} from "lucide-react";
import {
  Link
} from "react-router-dom";
import {
  useQuery
} from "@tanstack/react-query";

import LoadingState from "../../components/ui/LoadingState";
import ErrorState from "../../components/ui/ErrorState";

import {
  getAdminAnalytics
} from "../../features/admin/adminAnalyticsApi";

import {
  orderStatusLabels,
  paymentMethodLabels
} from "../../utils/adminOrderUtils";

import {
  formatPrice
} from "../../utils/cartUtils";

const periodOptions = [
  {
    value: 7,
    label: "Last 7 days"
  },
  {
    value: 30,
    label: "Last 30 days"
  },
  {
    value: 90,
    label: "Last 90 days"
  },
  {
    value: 365,
    label: "Last year"
  }
];

const statusClasses = {
  pending:
    "bg-amber-50 text-amber-800",
  confirmed:
    "bg-blue-50 text-blue-800",
  preparing:
    "bg-violet-50 text-violet-800",
  ready:
    "bg-cyan-50 text-cyan-800",
  out_for_delivery:
    "bg-indigo-50 text-indigo-800",
  delivered:
    "bg-green-50 text-green-800",
  cancelled:
    "bg-red-50 text-red-800"
};

function formatNumber(value) {
  return new Intl.NumberFormat(
    "en-EG"
  ).format(Number(value || 0));
}

function formatChartDate(value) {
  const date = new Date(
    `${value}T00:00:00`
  );

  return new Intl.DateTimeFormat(
    "en-EG",
    {
      month: "short",
      day: "numeric"
    }
  ).format(date);
}

function MetricCard({
  label,
  value,
  description,
  icon: Icon
}) {
  return (
    <article className="rounded-[1.7rem] border border-[#e5d8d2] bg-white p-6 shadow-sm">
      <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-[#f4e5df] text-[#7b584d]">
        <Icon size={21} />
      </div>

      <p className="mt-6 text-sm font-semibold text-[#806a62]">
        {label}
      </p>

      <p className="mt-2 text-3xl font-semibold tracking-[-0.04em] text-[#2c1f1b]">
        {value}
      </p>

      <p className="mt-2 text-sm leading-6 text-[#9a8178]">
        {description}
      </p>
    </article>
  );
}

function ActivityChart({
  daily
}) {
  const maximumRevenue = Math.max(
    ...daily.map(
      (entry) =>
        Number(entry.revenue || 0)
    ),
    1
  );

  const displayedDaily =
    daily.length > 31
      ? daily.filter(
          (entry, index) =>
            index %
              Math.ceil(
                daily.length / 31
              ) ===
              0 ||
            index ===
              daily.length - 1
        )
      : daily;

  return (
    <div className="mt-6 overflow-x-auto pb-2">
      <div
        className="flex min-w-[720px] items-end gap-2"
        style={{
          height: "260px"
        }}
      >
        {displayedDaily.map(
          (entry) => {
            const height =
              Math.max(
                (Number(
                  entry.revenue || 0
                ) /
                  maximumRevenue) *
                  190,
                entry.revenue > 0
                  ? 8
                  : 2
              );

            return (
              <div
                key={entry.date}
                className="group flex min-w-0 flex-1 flex-col items-center justify-end"
              >
                <div className="pointer-events-none mb-2 hidden whitespace-nowrap rounded-xl bg-[#2c1f1b] px-3 py-2 text-xs text-white shadow-lg group-hover:block">
                  <p className="font-semibold">
                    {formatPrice(
                      entry.revenue
                    )}
                  </p>

                  <p className="mt-1 text-white/60">
                    {entry.orders} order
                    {entry.orders === 1
                      ? ""
                      : "s"}
                  </p>
                </div>

                <div
                  className="w-full min-w-3 rounded-t-lg bg-[#8a675c] transition hover:bg-[#5a3d34]"
                  style={{
                    height: `${height}px`
                  }}
                />

                <span className="mt-3 -rotate-45 whitespace-nowrap text-[10px] text-[#806a62]">
                  {formatChartDate(
                    entry.date
                  )}
                </span>
              </div>
            );
          }
        )}
      </div>
    </div>
  );
}

export default function AdminAnalyticsPage() {
  const [days, setDays] =
    useState(30);

  const analyticsQuery = useQuery({
    queryKey: [
      "admin-analytics",
      days
    ],

    queryFn: () =>
      getAdminAnalytics({
        days
      })
  });

  const analytics =
    analyticsQuery.data
      ?.analytics;

  const metrics =
    analytics?.metrics || {};

  const daily =
    analytics?.daily || [];

  const statusBreakdown =
    analytics?.statusBreakdown ||
    [];

  const paymentMethods =
    analytics
      ?.paymentMethodBreakdown ||
    [];

  const topProducts =
    analytics?.topProducts || [];

  const lowStockProducts =
    analytics?.lowStockProducts ||
    [];

  const maximumStatusCount =
    useMemo(
      () =>
        Math.max(
          ...statusBreakdown.map(
            (entry) => entry.count
          ),
          1
        ),
      [statusBreakdown]
    );

  const maximumPaymentCount =
    useMemo(
      () =>
        Math.max(
          ...paymentMethods.map(
            (entry) => entry.count
          ),
          1
        ),
      [paymentMethods]
    );

  if (analyticsQuery.isLoading) {
    return (
      <LoadingState label="Loading analytics..." />
    );
  }

  if (
    analyticsQuery.isError ||
    !analytics
  ) {
    return (
      <ErrorState message="Analytics could not be loaded." />
    );
  }

  const metricCards = [
    {
      label:
        "Delivered revenue",

      value: formatPrice(
        metrics.deliveredRevenue
      ),

      description:
        "Revenue from orders marked as delivered",

      icon:
        CircleDollarSign
    },

    {
      label: "Total orders",

      value: formatNumber(
        metrics.totalOrders
      ),

      description:
        `Orders created during the selected ${days}-day period`,

      icon: ShoppingBag
    },

    {
      label:
        "Average order value",

      value: formatPrice(
        metrics.averageOrderValue
      ),

      description:
        "Average value of delivered orders",

      icon: TrendingUp
    },

    {
      label:
        "Pending orders",

      value: formatNumber(
        metrics.pendingOrders
      ),

      description:
        "Orders still moving through fulfilment",

      icon: Clock3
    },

    {
      label:
        "Delivered orders",

      value: formatNumber(
        metrics.deliveredOrders
      ),

      description:
        "Successfully completed deliveries",

      icon:
        CheckCircle2
    },

    {
      label:
        "Cancelled orders",

      value: formatNumber(
        metrics.cancelledOrders
      ),

      description:
        "Cancelled during the selected period",

      icon: Ban
    },

    {
      label:
        "Payment reviews",

      value: formatNumber(
        metrics.paymentReviewOrders
      ),

      description:
        "Manual payments waiting for review",

      icon: CreditCard
    },

    {
      label:
        "Active products",

      value: formatNumber(
        metrics.activeProductCount
      ),

      description:
        `${metrics.lowStockCount || 0} currently low in stock`,

      icon: Boxes
    }
  ];

  return (
    <div>
      <div className="flex flex-col justify-between gap-5 lg:flex-row lg:items-end">
        <div>
          <p className="text-sm font-semibold uppercase tracking-[0.22em] text-[#a77d70]">
            Performance
          </p>

          <h2 className="mt-2 text-4xl font-semibold tracking-[-0.04em] text-[#2c1f1b]">
            Store analytics
          </h2>

          <p className="mt-3 max-w-2xl leading-7 text-[#735f58]">
            Track revenue, orders,
            fulfilment, payment methods,
            product performance, and
            inventory warnings.
          </p>
        </div>

        <label className="grid w-full max-w-xs gap-2">
          <span className="text-xs font-semibold uppercase tracking-[0.14em] text-[#806a62]">
            Reporting period
          </span>

          <div className="relative">
            <CalendarDays
              size={17}
              className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-[#8a675c]"
            />

            <select
              value={days}
              onChange={(event) =>
                setDays(
                  Number(
                    event.target.value
                  )
                )
              }
              className="w-full appearance-none rounded-2xl border border-[#e5d8d2] bg-white py-3 pl-11 pr-4 font-semibold text-[#2c1f1b] outline-none"
            >
              {periodOptions.map(
                (option) => (
                  <option
                    key={option.value}
                    value={option.value}
                  >
                    {option.label}
                  </option>
                )
              )}
            </select>
          </div>
        </label>
      </div>

      <section className="mt-8 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {metricCards.map(
          (card) => (
            <MetricCard
              key={card.label}
              {...card}
            />
          )
        )}
      </section>

      <section className="mt-6 rounded-[1.8rem] border border-[#e5d8d2] bg-white p-6 shadow-sm">
        <div className="flex items-start gap-3">
          <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-[#f4e5df] text-[#7b584d]">
            <BarChart3 size={21} />
          </div>

          <div>
            <h3 className="text-xl font-semibold text-[#2c1f1b]">
              Delivered revenue
            </h3>

            <p className="mt-1 text-sm text-[#806a62]">
              Daily delivered revenue with
              order volume on hover.
            </p>
          </div>
        </div>

        <ActivityChart
          daily={daily}
        />
      </section>

      <section className="mt-6 grid gap-6 xl:grid-cols-2">
        <article className="rounded-[1.8rem] border border-[#e5d8d2] bg-white p-6 shadow-sm">
          <h3 className="text-xl font-semibold text-[#2c1f1b]">
            Order statuses
          </h3>

          <div className="mt-6 grid gap-4">
            {statusBreakdown.length ? (
              statusBreakdown.map(
                (entry) => {
                  const width =
                    (entry.count /
                      maximumStatusCount) *
                    100;

                  return (
                    <div
                      key={entry.status}
                    >
                      <div className="flex items-center justify-between gap-4">
                        <span
                          className={`rounded-full px-3 py-1.5 text-xs font-semibold ${
                            statusClasses[
                              entry.status
                            ] ||
                            "bg-stone-100 text-stone-700"
                          }`}
                        >
                          {orderStatusLabels[
                            entry.status
                          ] ||
                            entry.status}
                        </span>

                        <span className="font-semibold text-[#2c1f1b]">
                          {entry.count}
                        </span>
                      </div>

                      <div className="mt-2 h-2 overflow-hidden rounded-full bg-[#f1e9e5]">
                        <div
                          className="h-full rounded-full bg-[#8a675c]"
                          style={{
                            width: `${width}%`
                          }}
                        />
                      </div>
                    </div>
                  );
                }
              )
            ) : (
              <p className="text-sm text-[#806a62]">
                No orders in this period.
              </p>
            )}
          </div>
        </article>

        <article className="rounded-[1.8rem] border border-[#e5d8d2] bg-white p-6 shadow-sm">
          <h3 className="text-xl font-semibold text-[#2c1f1b]">
            Payment methods
          </h3>

          <div className="mt-6 grid gap-4">
            {paymentMethods.length ? (
              paymentMethods.map(
                (entry) => {
                  const width =
                    (entry.count /
                      maximumPaymentCount) *
                    100;

                  return (
                    <div
                      key={entry.method}
                    >
                      <div className="flex items-start justify-between gap-4">
                        <div>
                          <p className="font-semibold text-[#2c1f1b]">
                            {paymentMethodLabels[
                              entry.method
                            ] ||
                              entry.method}
                          </p>

                          <p className="mt-1 text-sm text-[#806a62]">
                            {formatPrice(
                              entry.value
                            )}
                          </p>
                        </div>

                        <span className="rounded-full bg-[#faf7f5] px-3 py-1.5 text-xs font-semibold text-[#735f58]">
                          {entry.count} orders
                        </span>
                      </div>

                      <div className="mt-3 h-2 overflow-hidden rounded-full bg-[#f1e9e5]">
                        <div
                          className="h-full rounded-full bg-[#8a675c]"
                          style={{
                            width: `${width}%`
                          }}
                        />
                      </div>
                    </div>
                  );
                }
              )
            ) : (
              <p className="text-sm text-[#806a62]">
                No payment activity in this
                period.
              </p>
            )}
          </div>
        </article>
      </section>

      <section className="mt-6 grid gap-6 xl:grid-cols-[1.2fr_0.8fr]">
        <article className="rounded-[1.8rem] border border-[#e5d8d2] bg-white p-6 shadow-sm">
          <div className="flex items-center gap-3">
            <PackageCheck
              size={22}
              className="text-[#8a675c]"
            />

            <h3 className="text-xl font-semibold text-[#2c1f1b]">
              Best-selling products
            </h3>
          </div>

          {!topProducts.length ? (
            <p className="mt-6 text-sm text-[#806a62]">
              No product sales in this
              period.
            </p>
          ) : (
            <div className="mt-6 grid gap-3">
              {topProducts.map(
                (product, index) => (
                  <article
                    key={`${
                      product.productId ||
                      product.productName
                    }-${index}`}
                    className="grid grid-cols-[42px_58px_1fr_auto] items-center gap-3 rounded-3xl bg-[#faf7f5] p-3"
                  >
                    <div className="flex h-9 w-9 items-center justify-center rounded-full bg-[#2c1f1b] text-sm font-semibold text-white">
                      {index + 1}
                    </div>

                    <div className="h-14 w-14 overflow-hidden rounded-2xl bg-[#f4e5df]">
                      {product.productImage ? (
                        <img
                          src={
                            product.productImage
                          }
                          alt={
                            product.productName
                          }
                          className="h-full w-full object-cover"
                        />
                      ) : (
                        <div className="flex h-full items-center justify-center text-xs font-semibold text-[#8a675c]">
                          T&W
                        </div>
                      )}
                    </div>

                    <div className="min-w-0">
                      <p className="truncate font-semibold text-[#2c1f1b]">
                        {product.productName}
                      </p>

                      <p className="mt-1 text-sm text-[#806a62]">
                        {product.quantitySold} sold ·{" "}
                        {product.orderCount} orders
                      </p>
                    </div>

                    <p className="text-right font-semibold text-[#4b332b]">
                      {formatPrice(
                        product.orderRevenue
                      )}
                    </p>
                  </article>
                )
              )}
            </div>
          )}
        </article>

        <article className="rounded-[1.8rem] border border-[#e5d8d2] bg-white p-6 shadow-sm">
          <div className="flex items-center gap-3">
            <AlertTriangle
              size={22}
              className="text-amber-700"
            />

            <div>
              <h3 className="text-xl font-semibold text-[#2c1f1b]">
                Low stock
              </h3>

              <p className="mt-1 text-sm text-[#806a62]">
                {metrics.lowStockThreshold} or
                fewer remaining
              </p>
            </div>
          </div>

          {!lowStockProducts.length ? (
            <div className="mt-6 rounded-3xl bg-green-50 p-6 text-center text-green-800">
              <CheckCircle2
                size={30}
                className="mx-auto"
              />

              <p className="mt-3 font-semibold">
                Inventory looks healthy
              </p>
            </div>
          ) : (
            <div className="mt-6 grid gap-3">
              {lowStockProducts.map(
                (product) => (
                  <Link
                    key={product._id}
                    to={`/admin/products/${product._id}`}
                    className="flex items-center gap-3 rounded-2xl bg-[#faf7f5] p-3 transition hover:bg-[#fff4ef]"
                  >
                    <div className="h-12 w-12 shrink-0 overflow-hidden rounded-xl bg-[#f4e5df]">
                      {product.imageUrl ? (
                        <img
                          src={
                            product.imageUrl
                          }
                          alt={product.name}
                          className="h-full w-full object-cover"
                        />
                      ) : (
                        <div className="flex h-full items-center justify-center text-xs font-semibold text-[#8a675c]">
                          T&W
                        </div>
                      )}
                    </div>

                    <div className="min-w-0 flex-1">
                      <p className="truncate font-semibold text-[#2c1f1b]">
                        {product.name}
                      </p>

                      {product.sku ? (
                        <p className="mt-1 text-xs text-[#806a62]">
                          SKU: {product.sku}
                        </p>
                      ) : null}
                    </div>

                    <span
                      className={`rounded-full px-3 py-1.5 text-xs font-semibold ${
                        product.stock === 0
                          ? "bg-red-50 text-red-700"
                          : "bg-amber-50 text-amber-800"
                      }`}
                    >
                      {product.stock === 0
                        ? "Out"
                        : `${product.stock} left`}
                    </span>
                  </Link>
                )
              )}
            </div>
          )}
        </article>
      </section>
    </div>
  );
}