import { useState } from "react";
import {
  ChevronLeft,
  ChevronRight,
  Eye,
  Filter,
  Search,
  ShoppingBag
} from "lucide-react";
import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";

import OrderStatusBadge from "../../components/admin/OrderStatusBadge";
import LoadingState from "../../components/ui/LoadingState";
import ErrorState from "../../components/ui/ErrorState";

import {
  getAdminOrders
} from "../../features/admin/adminOrderApi";

import {
  formatAdminDate,
  paymentMethodLabels
} from "../../utils/adminOrderUtils";

import {
  formatPrice
} from "../../utils/cartUtils";

export default function AdminOrdersPage() {
  const [draftSearch, setDraftSearch] = useState("");
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("all");

  const [
    paymentStatus,
    setPaymentStatus
  ] = useState("all");

  const [
    paymentMethod,
    setPaymentMethod
  ] = useState("all");

  const [page, setPage] = useState(1);

  const ordersQuery = useQuery({
    queryKey: [
      "admin-orders",
      search,
      status,
      paymentStatus,
      paymentMethod,
      page
    ],

    queryFn: () =>
      getAdminOrders({
        search,
        status,
        paymentStatus,
        paymentMethod,
        page,
        limit: 20
      })
  });

  const orders = ordersQuery.data?.orders || [];

  const pagination =
    ordersQuery.data?.pagination;

  function handleSearch(event) {
    event.preventDefault();

    setSearch(draftSearch.trim());
    setPage(1);
  }

  function clearFilters() {
    setDraftSearch("");
    setSearch("");
    setStatus("all");
    setPaymentStatus("all");
    setPaymentMethod("all");
    setPage(1);
  }

  return (
    <div>
      <div className="flex flex-col justify-between gap-5 md:flex-row md:items-end">
        <div>
          <p className="text-sm font-semibold uppercase tracking-[0.22em] text-[#a77d70]">
            Order management
          </p>

          <h2 className="mt-2 text-4xl font-semibold tracking-[-0.04em]">
            Customer orders
          </h2>

          <p className="mt-3 max-w-2xl leading-7 text-[#735f58]">
            Review customer details, customization files,
            payments, delivery information, and order
            progress.
          </p>
        </div>

        <div className="inline-flex w-fit items-center gap-2 rounded-full border border-[#dfd1ca] bg-white px-4 py-2.5 text-sm font-semibold text-[#5a3d34]">
          <ShoppingBag size={17} />
          {pagination?.total || 0} orders
        </div>
      </div>

      <section className="mt-8 rounded-[1.7rem] border border-[#e5d8d2] bg-white p-5 shadow-sm">
        <form
          onSubmit={handleSearch}
          className="flex flex-col gap-3 lg:flex-row"
        >
          <div className="relative flex-1">
            <Search
              size={18}
              className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-[#9a8178]"
            />

            <input
              value={draftSearch}
              onChange={(event) =>
                setDraftSearch(event.target.value)
              }
              placeholder="Search order number, customer, email, or phone..."
              className="w-full rounded-2xl border border-[#e5d8d2] bg-[#faf7f5] py-3 pl-11 pr-4 outline-none transition focus:border-[#9a766b]"
            />
          </div>

          <button
            type="submit"
            className="rounded-2xl bg-[#2c1f1b] px-6 py-3 text-sm font-semibold text-white transition hover:bg-[#4b332b]"
          >
            Search
          </button>
        </form>

        <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <label className="grid gap-2">
            <span className="text-xs font-semibold uppercase tracking-[0.15em] text-[#806a62]">
              Order status
            </span>

            <select
              value={status}
              onChange={(event) => {
                setStatus(event.target.value);
                setPage(1);
              }}
              className="rounded-2xl border border-[#e5d8d2] bg-white px-4 py-3 outline-none"
            >
              <option value="all">All statuses</option>
              <option value="pending">Pending</option>
              <option value="confirmed">Confirmed</option>
              <option value="preparing">Preparing</option>
              <option value="ready">Ready</option>
              <option value="out_for_delivery">
                Out for delivery
              </option>
              <option value="delivered">Delivered</option>
              <option value="cancelled">Cancelled</option>
            </select>
          </label>

          <label className="grid gap-2">
            <span className="text-xs font-semibold uppercase tracking-[0.15em] text-[#806a62]">
              Payment status
            </span>

            <select
              value={paymentStatus}
              onChange={(event) => {
                setPaymentStatus(event.target.value);
                setPage(1);
              }}
              className="rounded-2xl border border-[#e5d8d2] bg-white px-4 py-3 outline-none"
            >
              <option value="all">All payments</option>
              <option value="unpaid">Unpaid</option>
              <option value="pending_review">
                Pending review
              </option>
              <option value="paid">Paid</option>
              <option value="failed">Failed</option>
              <option value="refunded">Refunded</option>
            </select>
          </label>

          <label className="grid gap-2">
            <span className="text-xs font-semibold uppercase tracking-[0.15em] text-[#806a62]">
              Payment method
            </span>

            <select
              value={paymentMethod}
              onChange={(event) => {
                setPaymentMethod(event.target.value);
                setPage(1);
              }}
              className="rounded-2xl border border-[#e5d8d2] bg-white px-4 py-3 outline-none"
            >
              <option value="all">All methods</option>
              <option value="cod">Cash on Delivery</option>
              <option value="instapay">InstaPay</option>
              <option value="vodafone_cash">
                Vodafone Cash
              </option>
              <option value="card">Card / Paymob</option>
            </select>
          </label>

          <button
            type="button"
            onClick={clearFilters}
            className="mt-auto flex items-center justify-center gap-2 rounded-2xl border border-[#e5d8d2] bg-[#faf7f5] px-5 py-3 text-sm font-semibold text-[#5a3d34] transition hover:bg-white"
          >
            <Filter size={16} />
            Clear filters
          </button>
        </div>
      </section>

      <section className="mt-6 overflow-hidden rounded-[1.7rem] border border-[#e5d8d2] bg-white shadow-sm">
        {ordersQuery.isLoading ? (
          <div className="p-6">
            <LoadingState label="Loading orders..." />
          </div>
        ) : null}

        {ordersQuery.isError ? (
          <div className="p-6">
            <ErrorState message="Orders could not be loaded." />
          </div>
        ) : null}

        {!ordersQuery.isLoading &&
        !ordersQuery.isError &&
        !orders.length ? (
          <div className="p-12 text-center">
            <ShoppingBag
              size={38}
              className="mx-auto text-[#a98a7f]"
            />

            <h3 className="mt-4 text-xl font-semibold">
              No matching orders
            </h3>

            <p className="mt-2 text-[#806a62]">
              Change the search or filters and try again.
            </p>
          </div>
        ) : null}

        {!ordersQuery.isLoading &&
        !ordersQuery.isError &&
        orders.length ? (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[1050px] border-collapse">
              <thead className="bg-[#faf7f5] text-left text-xs uppercase tracking-[0.12em] text-[#806a62]">
                <tr>
                  <th className="px-5 py-4">Order</th>
                  <th className="px-5 py-4">Customer</th>
                  <th className="px-5 py-4">Items</th>
                  <th className="px-5 py-4">Total</th>
                  <th className="px-5 py-4">Payment</th>
                  <th className="px-5 py-4">Status</th>
                  <th className="px-5 py-4">Created</th>
                  <th className="px-5 py-4" />
                </tr>
              </thead>

              <tbody>
                {orders.map((order) => {
                  const itemCount = order.items.reduce(
                    (total, item) =>
                      total + Number(item.quantity || 0),
                    0
                  );

                  return (
                    <tr
                      key={order._id}
                      className="border-t border-[#eee3de] align-top"
                    >
                      <td className="px-5 py-5">
                        <p className="font-semibold text-[#2c1f1b]">
                          {order.orderNumber}
                        </p>
                      </td>

                      <td className="px-5 py-5">
                        <p className="font-semibold">
                          {order.customer.fullName}
                        </p>

                        <p className="mt-1 text-sm text-[#806a62]">
                          {order.customer.phone}
                        </p>

                        <p className="mt-1 text-sm text-[#806a62]">
                          {order.customer.email}
                        </p>
                      </td>

                      <td className="px-5 py-5">
                        <p className="font-semibold">
                          {itemCount} item
                          {itemCount === 1 ? "" : "s"}
                        </p>
                      </td>

                      <td className="px-5 py-5 font-semibold">
                        {formatPrice(
                          order.totals.grandTotal
                        )}
                      </td>

                      <td className="px-5 py-5">
                        <p className="mb-2 text-sm font-semibold">
                          {paymentMethodLabels[
                            order.payment.method
                          ] || order.payment.method}
                        </p>

                        <OrderStatusBadge
                          type="payment"
                          status={order.payment.status}
                        />
                      </td>

                      <td className="px-5 py-5">
                        <OrderStatusBadge
                          status={order.status}
                        />
                      </td>

                      <td className="px-5 py-5 text-sm text-[#806a62]">
                        {formatAdminDate(order.createdAt)}
                      </td>

                      <td className="px-5 py-5">
                        <Link
                          to={`/admin/orders/${order._id}`}
                          className="inline-flex items-center gap-2 rounded-full border border-[#e5d8d2] bg-white px-4 py-2 text-sm font-semibold text-[#5a3d34] transition hover:bg-[#fff8f4]"
                        >
                          <Eye size={15} />
                          Open
                        </Link>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        ) : null}

        {pagination && pagination.totalPages > 1 ? (
          <div className="flex items-center justify-between border-t border-[#eee3de] px-5 py-4">
            <p className="text-sm text-[#806a62]">
              Page {pagination.page} of{" "}
              {pagination.totalPages}
            </p>

            <div className="flex gap-2">
              <button
                type="button"
                disabled={!pagination.hasPreviousPage}
                onClick={() =>
                  setPage((value) =>
                    Math.max(value - 1, 1)
                  )
                }
                className="rounded-full border border-[#e5d8d2] p-2.5 text-[#5a3d34] transition hover:bg-[#fff8f4] disabled:cursor-not-allowed disabled:opacity-40"
              >
                <ChevronLeft size={18} />
              </button>

              <button
                type="button"
                disabled={!pagination.hasNextPage}
                onClick={() =>
                  setPage((value) => value + 1)
                }
                className="rounded-full border border-[#e5d8d2] p-2.5 text-[#5a3d34] transition hover:bg-[#fff8f4] disabled:cursor-not-allowed disabled:opacity-40"
              >
                <ChevronRight size={18} />
              </button>
            </div>
          </div>
        ) : null}
      </section>
    </div>
  );
}