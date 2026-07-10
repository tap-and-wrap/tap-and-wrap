import {
  orderStatusLabels,
  paymentStatusLabels
} from "../../utils/adminOrderUtils";

const statusClasses = {
  pending: "bg-amber-50 text-amber-800",
  confirmed: "bg-blue-50 text-blue-800",
  preparing: "bg-violet-50 text-violet-800",
  ready: "bg-cyan-50 text-cyan-800",
  out_for_delivery: "bg-indigo-50 text-indigo-800",
  delivered: "bg-green-50 text-green-800",
  cancelled: "bg-red-50 text-red-800",

  unpaid: "bg-stone-100 text-stone-700",
  pending_review: "bg-amber-50 text-amber-800",
  paid: "bg-green-50 text-green-800",
  failed: "bg-red-50 text-red-800",
  refunded: "bg-purple-50 text-purple-800"
};

export default function OrderStatusBadge({
  status,
  type = "order"
}) {
  const labels =
    type === "payment"
      ? paymentStatusLabels
      : orderStatusLabels;

  return (
    <span
      className={`inline-flex rounded-full px-3 py-1 text-xs font-semibold ${
        statusClasses[status] ||
        "bg-stone-100 text-stone-700"
      }`}
    >
      {labels[status] || status || "Unknown"}
    </span>
  );
}