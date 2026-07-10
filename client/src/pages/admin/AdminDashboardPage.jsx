import {
  AlertTriangle,
  ArrowRight,
  BadgePercent,
  BarChart3,
  Boxes,
  CircleDollarSign,
  Clock3,
  FolderTree,
  Gift,
  PackageCheck,
  Percent,
  ShoppingBag,
  Sparkles,
  TrendingUp
} from "lucide-react";
import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";

import LoadingState from "../../components/ui/LoadingState";
import ErrorState from "../../components/ui/ErrorState";

import {
  getAdminAnalytics
} from "../../features/admin/adminAnalyticsApi";

import {
  formatPrice
} from "../../utils/cartUtils";

const quickActions = [
  {
    title: "Orders",
    description:
      "Review purchases, payments, fulfilment, and delivery status.",
    href: "/admin/orders",
    icon: ShoppingBag
  },
  {
    title: "Products",
    description:
      "Add products, images, prices, stock, and personalization.",
    href: "/admin/products",
    icon: Boxes
  },
  {
    title: "Categories",
    description:
      "Organize the store and control homepage visibility.",
    href: "/admin/categories",
    icon: FolderTree
  },
  {
    title: "Service requests",
    description:
      "Manage engraving, wrapping, printing, and custom requests.",
    href: "/admin/services",
    icon: Sparkles
  },
  {
    title: "Offers & bundles",
    description:
      "Create automatic bundles and quantity promotions.",
    href: "/admin/offers",
    icon: Gift
  },
  {
    title: "Discount codes",
    description:
      "Control percentage, fixed-price, and delivery codes.",
    href: "/admin/discounts",
    icon: BadgePercent
  },
  {
    title: "Analytics",
    description:
      "View revenue, product performance, and order activity.",
    href: "/admin/analytics",
    icon: BarChart3
  }
];

const statusLabels = {
  pending: "Pending",
  confirmed: "Confirmed",
  preparing: "Preparing",
  ready: "Ready",
  out_for_delivery: "Out for delivery",
  delivered: "Delivered",
  cancelled: "Cancelled"
};

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

function MetricCard({
  title,
  value,
  description,
  icon: Icon,
  href
}) {
  const content = (
    <article className="h-full rounded-[1.7rem] border border-[#e5d8d2] bg-white p-6 shadow-sm transition hover:-translate-y-0.5 hover:shadow-md">
      <div className="flex items-start justify-between gap-4">
        <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-[#f4e5df] text-[#7b584d]">
          <Icon size={21} />
        </div>

        {href ? (
          <ArrowRight
            size={17}
            className="text-[#a98a7f]"
          />
        ) : null}
      </div>

      <p className="mt-6 text-sm font-semibold text-[#806a62]">
        {title}
      </p>

      <p className="mt-2 text-3xl font-semibold tracking-[-0.04em] text-[#2c1f1b]">
        {value}
      </p>

      <p className="mt-2 text-sm leading-6 text-[#9a8178]">
        {description}
      </p>
    </article>
  );

  if (!href) {
    return content;
  }

  return (
    <Link to={href}>
      {content}
    </Link>
  );
}

export default function AdminDashboardPage() {
  const analyticsQuery = useQuery({
    queryKey: [
      "admin-dashboard-analytics"
    ],

    queryFn: () =>
      getAdminAnalytics({
        days: 30
      }),

    refetchInterval:
      5 * 60 * 1000
  });

  if (analyticsQuery.isLoading) {
    return (
      <LoadingState label="Preparing your dashboard..." />
    );
  }

  if (
    analyticsQuery.isError ||
    !analyticsQuery.data?.analytics
  ) {
    return (
      <ErrorState message="The admin dashboard could not be loaded. Make sure the backend is running." />
    );
  }

  const analytics =
    analyticsQuery.data.analytics;

  const metrics =
    analytics.metrics || {};

  const statusBreakdown =
    analytics.statusBreakdown || [];

  const topProducts =
    analytics.topProducts || [];

  const lowStockProducts =
    analytics.lowStockProducts || [];

  const maximumStatusCount =
    Math.max(
      ...statusBreakdown.map(
        (entry) =>
          Number(entry.count || 0)
      ),
      1
    );

  const metricCards = [
    {
      title:
        "Delivered revenue",

      value:
        formatPrice(
          metrics.deliveredRevenue
        ),

      description:
        "Revenue from delivered orders during the last 30 days.",

      icon:
        CircleDollarSign,

      href:
        "/admin/analytics"
    },
    {
      title:
        "Orders",

      value:
        formatNumber(
          metrics.totalOrders
        ),

      description:
        `${formatNumber(
          metrics.pendingOrders
        )} orders still moving through fulfilment.`,

      icon:
        ShoppingBag,

      href:
        "/admin/orders"
    },
    {
      title:
        "Average order",

      value:
        formatPrice(
          metrics.averageOrderValue
        ),

      description:
        "Average value of orders marked as delivered.",

      icon:
        TrendingUp,

      href:
        "/admin/analytics"
    },
    {
      title:
        "Payment reviews",

      value:
        formatNumber(
          metrics.paymentReviewOrders
        ),

      description:
        "Manual InstaPay or Vodafone Cash payments waiting for review.",

      icon:
        Clock3,

      href:
        "/admin/orders"
    },
    {
      title:
        "Active products",

      value:
        formatNumber(
          metrics.activeProductCount
        ),

      description:
        `${formatNumber(
          metrics.lowStockCount
        )} products are low or out of stock.`,

      icon:
        Boxes,

      href:
        "/admin/products"
    },
    {
      title:
        "Delivered orders",

      value:
        formatNumber(
          metrics.deliveredOrders
        ),

      description:
        "Orders completed successfully during the last 30 days.",

      icon:
        PackageCheck,

      href:
        "/admin/orders"
    }
  ];

  return (
    <div>
      <header className="flex flex-col justify-between gap-6 lg:flex-row lg:items-end">
        <div>
          <p className="text-sm font-semibold uppercase tracking-[0.22em] text-[#a77d70]">
            Tap & Wrap administration
          </p>

          <h1 className="mt-2 text-4xl font-semibold tracking-[-0.04em] text-[#2c1f1b] md:text-5xl">
            Store overview
          </h1>

          <p className="mt-4 max-w-2xl leading-7 text-[#735f58]">
            Manage the catalog, orders,
            custom requests, promotions,
            payments, and store performance
            from one place.
          </p>
        </div>

        <Link
          to="/admin/products/new"
          className="inline-flex w-fit items-center justify-center gap-2 rounded-full bg-[#2c1f1b] px-6 py-3.5 text-sm font-semibold text-white transition hover:bg-[#4b332b]"
        >
          <Boxes size={17} />
          Add new product
        </Link>
      </header>

      <section className="mt-8 grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        {metricCards.map(
          (card) => (
            <MetricCard
              key={card.title}
              {...card}
            />
          )
        )}
      </section>

      <section className="mt-7">
        <div className="flex items-end justify-between gap-4">
          <div>
            <p className="text-sm font-semibold uppercase tracking-[0.18em] text-[#a77d70]">
              Management
            </p>

            <h2 className="mt-2 text-2xl font-semibold tracking-[-0.03em] text-[#2c1f1b]">
              Quick actions
            </h2>
          </div>
        </div>

        <div className="mt-5 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {quickActions.map(
            ({
              title,
              description,
              href,
              icon: Icon
            }) => (
              <Link
                key={href}
                to={href}
                className="group rounded-[1.6rem] border border-[#e5d8d2] bg-white p-5 shadow-sm transition hover:-translate-y-0.5 hover:border-[#cdb4aa] hover:shadow-md"
              >
                <div className="flex items-start justify-between gap-4">
                  <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-[#f4e5df] text-[#7b584d] transition group-hover:bg-[#2c1f1b] group-hover:text-white">
                    <Icon size={20} />
                  </div>

                  <ArrowRight
                    size={17}
                    className="text-[#a98a7f] transition group-hover:translate-x-1"
                  />
                </div>

                <h3 className="mt-5 text-lg font-semibold text-[#2c1f1b]">
                  {title}
                </h3>

                <p className="mt-2 text-sm leading-6 text-[#806a62]">
                  {description}
                </p>
              </Link>
            )
          )}
        </div>
      </section>

      <section className="mt-7 grid gap-6 xl:grid-cols-2">
        <article className="rounded-[1.8rem] border border-[#e5d8d2] bg-white p-6 shadow-sm">
          <div className="flex items-center justify-between gap-4">
            <div>
              <p className="text-sm font-semibold uppercase tracking-[0.16em] text-[#a77d70]">
                Fulfilment
              </p>

              <h2 className="mt-2 text-2xl font-semibold tracking-[-0.03em] text-[#2c1f1b]">
                Order statuses
              </h2>
            </div>

            <Link
              to="/admin/orders"
              className="inline-flex items-center gap-2 text-sm font-semibold text-[#5a3d34]"
            >
              View orders
              <ArrowRight size={15} />
            </Link>
          </div>

          {!statusBreakdown.length ? (
            <div className="mt-6 rounded-3xl bg-[#faf7f5] p-8 text-center">
              <ShoppingBag
                size={30}
                className="mx-auto text-[#a98a7f]"
              />

              <p className="mt-3 font-semibold text-[#2c1f1b]">
                No orders yet
              </p>
            </div>
          ) : (
            <div className="mt-6 grid gap-4">
              {statusBreakdown.map(
                (entry) => {
                  const width =
                    Math.max(
                      (
                        Number(
                          entry.count || 0
                        ) /
                        maximumStatusCount
                      ) *
                        100,
                      2
                    );

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
                          {statusLabels[
                            entry.status
                          ] ||
                            entry.status}
                        </span>

                        <span className="font-semibold text-[#2c1f1b]">
                          {formatNumber(
                            entry.count
                          )}
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
              )}
            </div>
          )}
        </article>

        <article className="rounded-[1.8rem] border border-[#e5d8d2] bg-white p-6 shadow-sm">
          <div className="flex items-center justify-between gap-4">
            <div>
              <p className="text-sm font-semibold uppercase tracking-[0.16em] text-[#a77d70]">
                Inventory
              </p>

              <h2 className="mt-2 text-2xl font-semibold tracking-[-0.03em] text-[#2c1f1b]">
                Low-stock alerts
              </h2>
            </div>

            <Link
              to="/admin/products"
              className="inline-flex items-center gap-2 text-sm font-semibold text-[#5a3d34]"
            >
              Products
              <ArrowRight size={15} />
            </Link>
          </div>

          {!lowStockProducts.length ? (
            <div className="mt-6 rounded-3xl bg-green-50 p-8 text-center text-green-800">
              <PackageCheck
                size={31}
                className="mx-auto"
              />

              <p className="mt-3 font-semibold">
                Inventory looks healthy
              </p>

              <p className="mt-1 text-sm">
                No products are below the
                current stock threshold.
              </p>
            </div>
          ) : (
            <div className="mt-6 grid gap-3">
              {lowStockProducts
                .slice(0, 6)
                .map((product) => (
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
                        <p className="mt-1 truncate text-xs text-[#806a62]">
                          SKU: {product.sku}
                        </p>
                      ) : null}
                    </div>

                    <span
                      className={`shrink-0 rounded-full px-3 py-1.5 text-xs font-semibold ${
                        Number(
                          product.stock
                        ) === 0
                          ? "bg-red-50 text-red-700"
                          : "bg-amber-50 text-amber-800"
                      }`}
                    >
                      {Number(
                        product.stock
                      ) === 0
                        ? "Out"
                        : `${product.stock} left`}
                    </span>
                  </Link>
                ))}
            </div>
          )}
        </article>
      </section>

      <section className="mt-7 rounded-[1.8rem] border border-[#e5d8d2] bg-white p-6 shadow-sm">
        <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
          <div>
            <p className="text-sm font-semibold uppercase tracking-[0.16em] text-[#a77d70]">
              Product performance
            </p>

            <h2 className="mt-2 text-2xl font-semibold tracking-[-0.03em] text-[#2c1f1b]">
              Best-selling products
            </h2>
          </div>

          <Link
            to="/admin/analytics"
            className="inline-flex w-fit items-center gap-2 text-sm font-semibold text-[#5a3d34]"
          >
            Full analytics
            <ArrowRight size={15} />
          </Link>
        </div>

        {!topProducts.length ? (
          <div className="mt-6 rounded-3xl bg-[#faf7f5] p-8 text-center">
            <Percent
              size={31}
              className="mx-auto text-[#a98a7f]"
            />

            <p className="mt-3 font-semibold text-[#2c1f1b]">
              No sales activity yet
            </p>
          </div>
        ) : (
          <div className="mt-6 grid gap-3 lg:grid-cols-2">
            {topProducts
              .slice(0, 6)
              .map(
                (
                  product,
                  index
                ) => (
                  <article
                    key={`${
                      product.productId ||
                      product.productName
                    }-${index}`}
                    className="grid grid-cols-[38px_58px_1fr_auto] items-center gap-3 rounded-3xl bg-[#faf7f5] p-3"
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
                        {
                          product.productName
                        }
                      </p>

                      <p className="mt-1 text-sm text-[#806a62]">
                        {formatNumber(
                          product.quantitySold
                        )}{" "}
                        sold ·{" "}
                        {formatNumber(
                          product.orderCount
                        )}{" "}
                        orders
                      </p>
                    </div>

                    <p className="text-right text-sm font-semibold text-[#4b332b]">
                      {formatPrice(
                        product.orderRevenue
                      )}
                    </p>
                  </article>
                )
              )}
          </div>
        )}
      </section>

      {Number(
        metrics.paymentReviewOrders
      ) > 0 ||
      Number(
        metrics.lowStockCount
      ) > 0 ? (
        <section className="mt-7 rounded-[1.8rem] border border-amber-200 bg-amber-50 p-6">
          <div className="flex items-start gap-4">
            <AlertTriangle
              size={24}
              className="mt-0.5 shrink-0 text-amber-700"
            />

            <div>
              <h2 className="text-lg font-semibold text-amber-950">
                Items need attention
              </h2>

              <p className="mt-2 leading-7 text-amber-900/80">
                {Number(
                  metrics.paymentReviewOrders
                ) > 0
                  ? `${formatNumber(
                      metrics.paymentReviewOrders
                    )} payment review${
                      Number(
                        metrics.paymentReviewOrders
                      ) === 1
                        ? ""
                        : "s"
                    } waiting. `
                  : ""}

                {Number(
                  metrics.lowStockCount
                ) > 0
                  ? `${formatNumber(
                      metrics.lowStockCount
                    )} product${
                      Number(
                        metrics.lowStockCount
                      ) === 1
                        ? " is"
                        : "s are"
                    } low or out of stock.`
                  : ""}
              </p>
            </div>
          </div>
        </section>
      ) : null}
    </div>
  );
}