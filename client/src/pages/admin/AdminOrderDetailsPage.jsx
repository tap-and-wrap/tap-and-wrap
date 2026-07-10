import {
  useEffect,
  useState
} from "react";
import {
  ArrowLeft,
  ExternalLink,
  LoaderCircle,
  Mail,
  MapPin,
  Package,
  Phone,
  ReceiptText,
  Save,
  Sparkles,
  Truck
} from "lucide-react";
import {
  Link,
  useParams
} from "react-router-dom";
import {
  useMutation,
  useQuery,
  useQueryClient
} from "@tanstack/react-query";
import toast from "react-hot-toast";

import OrderStatusBadge from "../../components/admin/OrderStatusBadge";
import LoadingState from "../../components/ui/LoadingState";
import ErrorState from "../../components/ui/ErrorState";

import {
  getAdminOrder,
  getAdminOrderErrorMessage,
  updateAdminOrderStatus,
  updateAdminPaymentStatus
} from "../../features/admin/adminOrderApi";

import {
  formatAdminDate,
  orderStatusLabels,
  orderStatusTransitions,
  paymentMethodLabels,
  paymentStatusLabels,
  paymentStatusTransitions
} from "../../utils/adminOrderUtils";

import {
  formatPrice
} from "../../utils/cartUtils";

const fieldClassName =
  "w-full rounded-2xl border border-[#e5d8d2] bg-white px-4 py-3 outline-none transition focus:border-[#9a766b]";

export default function AdminOrderDetailsPage() {
  const { id } = useParams();
  const queryClient = useQueryClient();

  const [nextStatus, setNextStatus] = useState("");
  const [internalNote, setInternalNote] = useState("");

  const [
    cancellationReason,
    setCancellationReason
  ] = useState("");

  const [
    nextPaymentStatus,
    setNextPaymentStatus
  ] = useState("");

  const [
    transactionId,
    setTransactionId
  ] = useState("");

  const [paymentNote, setPaymentNote] =
    useState("");

  const orderQuery = useQuery({
    queryKey: ["admin-order", id],
    queryFn: () => getAdminOrder(id)
  });

  const order = orderQuery.data?.order;

  useEffect(() => {
    if (!order) {
      return;
    }

    setNextStatus(order.status);
    setInternalNote(order.internalNote || "");
    setCancellationReason(
      order.cancellationReason || ""
    );

    setNextPaymentStatus(order.payment.status);
    setTransactionId(
      order.payment.transactionId || ""
    );
  }, [order]);

  const statusMutation = useMutation({
    mutationFn: updateAdminOrderStatus,

    onSuccess() {
      toast.success("Order status updated");

      queryClient.invalidateQueries({
        queryKey: ["admin-order", id]
      });

      queryClient.invalidateQueries({
        queryKey: ["admin-orders"]
      });

      queryClient.invalidateQueries({
        queryKey: ["admin-dashboard"]
      });
    },

    onError(error) {
      toast.error(
        getAdminOrderErrorMessage(error)
      );
    }
  });

  const paymentMutation = useMutation({
    mutationFn: updateAdminPaymentStatus,

    onSuccess() {
      toast.success("Payment status updated");

      queryClient.invalidateQueries({
        queryKey: ["admin-order", id]
      });

      queryClient.invalidateQueries({
        queryKey: ["admin-orders"]
      });

      queryClient.invalidateQueries({
        queryKey: ["admin-dashboard"]
      });
    },

    onError(error) {
      toast.error(
        getAdminOrderErrorMessage(error)
      );
    }
  });

  function handleStatusUpdate(event) {
    event.preventDefault();

    if (
      nextStatus === "cancelled" &&
      !cancellationReason.trim()
    ) {
      toast.error("Enter a cancellation reason");

      return;
    }

    statusMutation.mutate({
      id,

      payload: {
        status: nextStatus,
        internalNote: internalNote.trim(),
        cancellationReason:
          cancellationReason.trim()
      }
    });
  }

  function handlePaymentUpdate(event) {
    event.preventDefault();

    paymentMutation.mutate({
      id,

      payload: {
        status: nextPaymentStatus,
        transactionId: transactionId.trim(),
        note: paymentNote.trim()
      }
    });
  }

  if (orderQuery.isLoading) {
    return <LoadingState label="Loading order..." />;
  }

  if (orderQuery.isError || !order) {
    return (
      <ErrorState message="This order could not be loaded." />
    );
  }

  const availableOrderStatuses = [
    order.status,
    ...(orderStatusTransitions[order.status] || [])
  ];

  const availablePaymentStatuses = [
    order.payment.status,
    ...(paymentStatusTransitions[
      order.payment.status
    ] || [])
  ];

  const address = [
    order.shippingAddress.addressLine,
    order.shippingAddress.area,
    order.shippingAddress.city,
    order.shippingAddress.governorate
  ]
    .filter(Boolean)
    .join(", ");

  return (
    <div>
      <Link
        to="/admin/orders"
        className="inline-flex items-center gap-2 text-sm font-semibold text-[#735f58] transition hover:text-[#2c1f1b]"
      >
        <ArrowLeft size={17} />
        Back to orders
      </Link>

      <div className="mt-5 flex flex-col justify-between gap-5 lg:flex-row lg:items-start">
        <div>
          <p className="text-sm font-semibold uppercase tracking-[0.22em] text-[#a77d70]">
            Order details
          </p>

          <h2 className="mt-2 text-4xl font-semibold tracking-[-0.04em]">
            {order.orderNumber}
          </h2>

          <p className="mt-3 text-[#735f58]">
            Created {formatAdminDate(order.createdAt)}
          </p>
        </div>

        <div className="flex flex-wrap gap-2">
          <OrderStatusBadge status={order.status} />

          <OrderStatusBadge
            type="payment"
            status={order.payment.status}
          />
        </div>
      </div>

      <section className="mt-8 grid gap-5 xl:grid-cols-3">
        <article className="rounded-[1.7rem] border border-[#e5d8d2] bg-white p-6 shadow-sm">
          <Mail
            size={22}
            className="text-[#8a675c]"
          />

          <h3 className="mt-5 text-xl font-semibold">
            Customer
          </h3>

          <div className="mt-4 grid gap-2 text-sm text-[#735f58]">
            <p className="font-semibold text-[#2c1f1b]">
              {order.customer.fullName}
            </p>

            <a href={`mailto:${order.customer.email}`}>
              {order.customer.email}
            </a>

            <a
              href={`tel:${order.customer.phone}`}
              className="inline-flex items-center gap-2"
            >
              <Phone size={14} />
              {order.customer.phone}
            </a>

            {order.customer.alternatePhone ? (
              <p>
                Alternate:{" "}
                {order.customer.alternatePhone}
              </p>
            ) : null}
          </div>
        </article>

        <article className="rounded-[1.7rem] border border-[#e5d8d2] bg-white p-6 shadow-sm">
          <MapPin
            size={22}
            className="text-[#8a675c]"
          />

          <h3 className="mt-5 text-xl font-semibold">
            Recipient and address
          </h3>

          <div className="mt-4 grid gap-2 text-sm leading-6 text-[#735f58]">
            <p className="font-semibold text-[#2c1f1b]">
              {order.shippingAddress.recipientName}
            </p>

            <p>
              {order.shippingAddress.recipientPhone}
            </p>

            <p>{address}</p>

            {order.shippingAddress.building ? (
              <p>
                Building:{" "}
                {order.shippingAddress.building}
              </p>
            ) : null}

            {order.shippingAddress.floor ? (
              <p>
                Floor: {order.shippingAddress.floor}
              </p>
            ) : null}

            {order.shippingAddress.apartment ? (
              <p>
                Apartment:{" "}
                {order.shippingAddress.apartment}
              </p>
            ) : null}

            {order.shippingAddress.landmark ? (
              <p>
                Landmark:{" "}
                {order.shippingAddress.landmark}
              </p>
            ) : null}
          </div>
        </article>

        <article className="rounded-[1.7rem] border border-[#e5d8d2] bg-white p-6 shadow-sm">
          <ReceiptText
            size={22}
            className="text-[#8a675c]"
          />

          <h3 className="mt-5 text-xl font-semibold">
            Payment
          </h3>

          <div className="mt-4 grid gap-3 text-sm text-[#735f58]">
            <p>
              Method:{" "}
              <strong className="text-[#2c1f1b]">
                {paymentMethodLabels[
                  order.payment.method
                ] || order.payment.method}
              </strong>
            </p>

            <OrderStatusBadge
              type="payment"
              status={order.payment.status}
            />

            {order.payment.transactionId ? (
              <p>
                Transaction:{" "}
                {order.payment.transactionId}
              </p>
            ) : null}

            {order.payment.proofImageUrl ? (
              <a
                href={order.payment.proofImageUrl}
                target="_blank"
                rel="noreferrer"
                className="inline-flex w-fit items-center gap-2 rounded-full border border-[#e5d8d2] px-4 py-2 font-semibold text-[#5a3d34]"
              >
                <ExternalLink size={15} />
                View payment proof
              </a>
            ) : null}
          </div>
        </article>
      </section>

      <section className="mt-6 rounded-[1.7rem] border border-[#e5d8d2] bg-white p-6 shadow-sm">
        <div className="flex items-center gap-3">
          <Package
            size={22}
            className="text-[#8a675c]"
          />

          <h3 className="text-xl font-semibold">
            Order items
          </h3>
        </div>

        <div className="mt-6 grid gap-5">
          {order.items.map((item) => (
            <article
              key={item._id}
              className="grid gap-5 rounded-3xl border border-[#eee3de] bg-[#faf7f5] p-5 lg:grid-cols-[110px_1fr_auto]"
            >
              <div className="aspect-square overflow-hidden rounded-2xl bg-[#f4e5df]">
                {item.productImage ? (
                  <img
                    src={item.productImage}
                    alt={item.productName}
                    className="h-full w-full object-cover"
                  />
                ) : (
                  <div className="flex h-full items-center justify-center text-sm font-semibold text-[#8a675c]">
                    Tap & Wrap
                  </div>
                )}
              </div>

              <div>
                <h4 className="text-lg font-semibold">
                  {item.productName}
                </h4>

                <p className="mt-1 text-sm text-[#806a62]">
                  Quantity: {item.quantity}
                </p>

                <div className="mt-4 grid gap-3 md:grid-cols-2">
                  {item.engraving?.enabled ? (
                    <div className="rounded-2xl bg-white p-4 text-sm leading-6 text-[#735f58]">
                      <p className="flex items-center gap-2 font-semibold text-[#2c1f1b]">
                        <Sparkles size={16} />
                        Engraving
                      </p>

                      <p className="mt-2">
                        Type: {item.engraving.type}
                      </p>

                      {item.engraving.text ? (
                        <p>
                          Text: {item.engraving.text}
                        </p>
                      ) : null}

                      {item.engraving.placement ? (
                        <p>
                          Placement:{" "}
                          {item.engraving.placement}
                        </p>
                      ) : null}

                      {item.engraving.imageUrl ? (
                        <a
                          href={item.engraving.imageUrl}
                          target="_blank"
                          rel="noreferrer"
                          className="mt-3 inline-flex items-center gap-2 font-semibold text-[#5a3d34]"
                        >
                          <ExternalLink size={14} />
                          Open engraving image
                        </a>
                      ) : null}
                    </div>
                  ) : null}

                  {item.wrapping?.enabled ? (
                    <div className="rounded-2xl bg-white p-4 text-sm leading-6 text-[#735f58]">
                      <p className="font-semibold text-[#2c1f1b]">
                        Wrapping
                      </p>

                      <p className="mt-2">
                        Box: {item.wrapping.boxColor}
                      </p>

                      <p>
                        Ribbon: {item.wrapping.ribbonColor}
                      </p>

                      {item.wrapping.giftCard ? (
                        <p>
                          Gift card:{" "}
                          {item.wrapping.giftCardMessage}
                        </p>
                      ) : null}

                      {item.wrapping.textOnBox ? (
                        <p>
                          Box text: {item.wrapping.boxText}
                        </p>
                      ) : null}

                      {item.wrapping.fillers ? (
                        <p>Fillers included</p>
                      ) : null}
                    </div>
                  ) : null}
                </div>
              </div>

              <div className="text-left lg:text-right">
                <p className="text-sm text-[#806a62]">
                  Unit total
                </p>

                <p className="mt-1 font-semibold">
                  {formatPrice(item.unitTotal)}
                </p>

                <p className="mt-4 text-sm text-[#806a62]">
                  Line total
                </p>

                <p className="mt-1 text-xl font-semibold">
                  {formatPrice(item.lineTotal)}
                </p>
              </div>
            </article>
          ))}
        </div>
      </section>

      <section className="mt-6 grid gap-5 xl:grid-cols-[1fr_380px]">
        <div className="grid gap-5">
          <form
            onSubmit={handleStatusUpdate}
            className="rounded-[1.7rem] border border-[#e5d8d2] bg-white p-6 shadow-sm"
          >
            <div className="flex items-center gap-3">
              <Truck
                size={22}
                className="text-[#8a675c]"
              />

              <h3 className="text-xl font-semibold">
                Order progress
              </h3>
            </div>

            <div className="mt-6 grid gap-4">
              <label className="grid gap-2">
                <span className="text-sm font-semibold">
                  Order status
                </span>

                <select
                  value={nextStatus}
                  onChange={(event) =>
                    setNextStatus(event.target.value)
                  }
                  className={fieldClassName}
                >
                  {availableOrderStatuses.map(
                    (status) => (
                      <option
                        key={status}
                        value={status}
                      >
                        {orderStatusLabels[status]}
                      </option>
                    )
                  )}
                </select>
              </label>

              {nextStatus === "cancelled" ? (
                <label className="grid gap-2">
                  <span className="text-sm font-semibold">
                    Cancellation reason
                  </span>

                  <textarea
                    value={cancellationReason}
                    onChange={(event) =>
                      setCancellationReason(
                        event.target.value
                      )
                    }
                    rows={3}
                    className={fieldClassName}
                    placeholder="Explain why the order was cancelled..."
                  />
                </label>
              ) : null}

              <label className="grid gap-2">
                <span className="text-sm font-semibold">
                  Internal note
                </span>

                <textarea
                  value={internalNote}
                  onChange={(event) =>
                    setInternalNote(event.target.value)
                  }
                  rows={4}
                  className={fieldClassName}
                  placeholder="Private note visible only to the admin..."
                />
              </label>

              <button
                type="submit"
                disabled={statusMutation.isPending}
                className="flex items-center justify-center gap-2 rounded-full bg-[#2c1f1b] px-6 py-3.5 text-sm font-semibold text-white transition hover:bg-[#4b332b] disabled:opacity-60"
              >
                {statusMutation.isPending ? (
                  <LoaderCircle
                    size={17}
                    className="animate-spin"
                  />
                ) : (
                  <Save size={17} />
                )}

                Update order
              </button>
            </div>
          </form>

          <form
            onSubmit={handlePaymentUpdate}
            className="rounded-[1.7rem] border border-[#e5d8d2] bg-white p-6 shadow-sm"
          >
            <h3 className="text-xl font-semibold">
              Payment verification
            </h3>

            <div className="mt-6 grid gap-4">
              <label className="grid gap-2">
                <span className="text-sm font-semibold">
                  Payment status
                </span>

                <select
                  value={nextPaymentStatus}
                  onChange={(event) =>
                    setNextPaymentStatus(
                      event.target.value
                    )
                  }
                  className={fieldClassName}
                >
                  {availablePaymentStatuses.map(
                    (status) => (
                      <option
                        key={status}
                        value={status}
                      >
                        {paymentStatusLabels[status]}
                      </option>
                    )
                  )}
                </select>
              </label>

              <label className="grid gap-2">
                <span className="text-sm font-semibold">
                  Transaction ID
                </span>

                <input
                  value={transactionId}
                  onChange={(event) =>
                    setTransactionId(event.target.value)
                  }
                  className={fieldClassName}
                  placeholder="Optional transaction reference"
                />
              </label>

              <label className="grid gap-2">
                <span className="text-sm font-semibold">
                  Payment note
                </span>

                <textarea
                  value={paymentNote}
                  onChange={(event) =>
                    setPaymentNote(event.target.value)
                  }
                  rows={3}
                  className={fieldClassName}
                  placeholder="Optional verification note..."
                />
              </label>

              <button
                type="submit"
                disabled={paymentMutation.isPending}
                className="flex items-center justify-center gap-2 rounded-full border border-[#d7c5bd] bg-[#fff8f4] px-6 py-3.5 text-sm font-semibold text-[#5a3d34] transition hover:bg-white disabled:opacity-60"
              >
                {paymentMutation.isPending ? (
                  <LoaderCircle
                    size={17}
                    className="animate-spin"
                  />
                ) : (
                  <Save size={17} />
                )}

                Update payment
              </button>
            </div>
          </form>
        </div>

        <aside className="h-fit rounded-[1.7rem] border border-[#e5d8d2] bg-[#2c1f1b] p-6 text-white shadow-sm">
          <h3 className="text-xl font-semibold">
            Order totals
          </h3>

          <div className="mt-6 grid gap-4 text-sm">
            <div className="flex justify-between gap-4 text-white/65">
              <span>Subtotal</span>
              <span>
                {formatPrice(order.totals.subtotal)}
              </span>
            </div>

            <div className="flex justify-between gap-4 text-white/65">
              <span>Delivery</span>
              <span>
                {formatPrice(order.totals.shippingFee)}
              </span>
            </div>

            <div className="flex justify-between gap-4 text-white/65">
              <span>Discount</span>
              <span>
                - {formatPrice(order.totals.discount)}
              </span>
            </div>

            <div className="flex justify-between gap-4 border-t border-white/10 pt-5 text-lg font-semibold">
              <span>Total</span>
              <span>
                {formatPrice(order.totals.grandTotal)}
              </span>
            </div>
          </div>

          {order.customerNote ? (
            <div className="mt-6 rounded-2xl bg-white/[0.07] p-4">
              <p className="text-xs font-semibold uppercase tracking-[0.16em] text-white/45">
                Customer note
              </p>

              <p className="mt-2 leading-7 text-white/75">
                {order.customerNote}
              </p>
            </div>
          ) : null}
        </aside>
      </section>
    </div>
  );
}