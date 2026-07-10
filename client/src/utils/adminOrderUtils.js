export const orderStatusLabels = {
  pending: "Pending",
  confirmed: "Confirmed",
  preparing: "Preparing",
  ready: "Ready",
  out_for_delivery: "Out for delivery",
  delivered: "Delivered",
  cancelled: "Cancelled"
};

export const paymentStatusLabels = {
  unpaid: "Unpaid",
  pending_review: "Pending review",
  paid: "Paid",
  failed: "Failed",
  refunded: "Refunded"
};

export const paymentMethodLabels = {
  cod: "Cash on Delivery",
  instapay: "InstaPay",
  vodafone_cash: "Vodafone Cash",
  card: "Card / Paymob"
};

export const orderStatusTransitions = {
  pending: ["confirmed", "cancelled"],
  confirmed: ["preparing", "cancelled"],
  preparing: ["ready", "cancelled"],
  ready: ["out_for_delivery", "cancelled"],
  out_for_delivery: ["delivered", "cancelled"],
  delivered: [],
  cancelled: []
};

export const paymentStatusTransitions = {
  unpaid: ["pending_review", "paid", "failed"],
  pending_review: ["paid", "failed"],
  paid: ["refunded"],
  failed: ["pending_review", "paid"],
  refunded: []
};

export function formatAdminDate(value) {
  if (!value) {
    return "—";
  }

  return new Intl.DateTimeFormat("en-EG", {
    dateStyle: "medium",
    timeStyle: "short"
  }).format(new Date(value));
}