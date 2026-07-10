import {
  getEmailSettings
} from "../config/email.js";

import {
  queueEmail,
  sendEmail
} from "./email.service.js";

const ORDER_STATUS_LABELS = {
  pending: "Order received",
  confirmed: "Order confirmed",
  preparing: "Preparing your order",
  ready: "Order ready",
  out_for_delivery: "Out for delivery",
  delivered: "Delivered",
  cancelled: "Cancelled"
};

const PAYMENT_STATUS_LABELS = {
  unpaid: "Unpaid",
  pending_review: "Payment under review",
  paid: "Paid",
  failed: "Payment failed",
  refunded: "Refunded"
};

const PAYMENT_METHOD_LABELS = {
  cod: "Cash on Delivery",
  instapay: "InstaPay",
  vodafone_cash: "Vodafone Cash",
  card: "Visa / Mastercard"
};

const SERVICE_STATUS_LABELS = {
  new: "New",
  contacted: "Contacted",
  quoted: "Quoted",
  approved: "Approved",
  in_progress: "In progress",
  completed: "Completed",
  cancelled: "Cancelled"
};

const SERVICE_TYPE_LABELS = {
  engraving: "Engraving",
  gift_wrapping: "Gift wrapping",
  photo_printing: "Photo printing",
  custom_gift: "Custom gift",
  corporate_gifting: "Corporate gifting",
  other: "Other"
};

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function formatMoney(value) {
  return `${new Intl.NumberFormat(
    "en-EG",
    {
      maximumFractionDigits: 2
    }
  ).format(Number(value || 0))} EGP`;
}

function formatDate(value) {
  if (!value) {
    return "—";
  }

  return new Intl.DateTimeFormat(
    "en-EG",
    {
      dateStyle: "medium",
      timeStyle: "short",
      timeZone: "Africa/Cairo"
    }
  ).format(new Date(value));
}

function getOrderAdminUrl(order) {
  const { clientUrl } =
    getEmailSettings();

  return `${clientUrl}/admin/orders/${order._id}`;
}

function getOrderTrackingUrl() {
  const { clientUrl } =
    getEmailSettings();

  return `${clientUrl}/track-order`;
}

function getServiceAdminUrl(request) {
  const { clientUrl } =
    getEmailSettings();

  return `${clientUrl}/admin/services/${request._id}`;
}

function emailShell({
  eyebrow,
  title,
  intro,
  content,
  actionLabel,
  actionUrl,
  footer
}) {
  const safeAction =
    actionLabel && actionUrl
      ? `
        <tr>
          <td style="padding:0 32px 30px;">
            <a
              href="${escapeHtml(actionUrl)}"
              style="display:inline-block;background:#2c1f1b;color:#ffffff;text-decoration:none;border-radius:999px;padding:13px 22px;font-weight:700;"
            >
              ${escapeHtml(actionLabel)}
            </a>
          </td>
        </tr>
      `
      : "";

  return `
    <!doctype html>
    <html>
      <body style="margin:0;background:#f7f3f1;font-family:Arial,sans-serif;color:#2c1f1b;">
        <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:#f7f3f1;padding:24px;">
          <tr>
            <td align="center">
              <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:680px;background:#ffffff;border:1px solid #ead9d2;border-radius:24px;overflow:hidden;">
                <tr>
                  <td style="background:#2c1f1b;color:#ffffff;padding:26px 32px;">
                    <div style="font-size:12px;letter-spacing:3px;color:#d9b9ad;font-weight:700;">
                      TAP & WRAP
                    </div>
                    <div style="margin-top:8px;font-size:13px;color:#ffffff99;">
                      ${escapeHtml(eyebrow)}
                    </div>
                  </td>
                </tr>

                <tr>
                  <td style="padding:30px 32px 12px;">
                    <h1 style="margin:0;font-size:30px;line-height:1.2;">
                      ${escapeHtml(title)}
                    </h1>

                    ${
                      intro
                        ? `<p style="margin:14px 0 0;color:#735f58;line-height:1.75;">${escapeHtml(intro)}</p>`
                        : ""
                    }
                  </td>
                </tr>

                <tr>
                  <td style="padding:10px 32px 30px;">
                    ${content}
                  </td>
                </tr>

                ${safeAction}

                <tr>
                  <td style="border-top:1px solid #ead9d2;padding:20px 32px;color:#806a62;font-size:12px;line-height:1.7;">
                    ${escapeHtml(
                      footer ||
                        "This is an automated Tap & Wrap notification."
                    )}
                  </td>
                </tr>
              </table>
            </td>
          </tr>
        </table>
      </body>
    </html>
  `;
}

function infoRow(label, value) {
  return `
    <tr>
      <td style="padding:9px 0;color:#806a62;vertical-align:top;">
        ${escapeHtml(label)}
      </td>
      <td style="padding:9px 0;text-align:right;font-weight:700;vertical-align:top;">
        ${escapeHtml(value)}
      </td>
    </tr>
  `;
}

function infoTable(rows) {
  return `
    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:#faf7f5;border-radius:18px;padding:8px 18px;">
      ${rows.join("")}
    </table>
  `;
}

function orderItemsHtml(order) {
  const rows = (order.items || [])
    .map(
      (item) => `
        <tr>
          <td style="padding:12px 0;border-bottom:1px solid #ead9d2;">
            <div style="font-weight:700;">${escapeHtml(item.productName)}</div>
            <div style="margin-top:4px;color:#806a62;font-size:13px;">
              Quantity: ${escapeHtml(item.quantity)}
              ${
                item.engraving?.enabled
                  ? " · Engraving"
                  : ""
              }
              ${
                item.wrapping?.enabled
                  ? " · Gift wrapping"
                  : ""
              }
            </div>
          </td>

          <td style="padding:12px 0;border-bottom:1px solid #ead9d2;text-align:right;font-weight:700;">
            ${escapeHtml(formatMoney(item.lineTotal))}
          </td>
        </tr>
      `
    )
    .join("");

  return `
    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="margin-top:20px;">
      <tr>
        <td colspan="2" style="padding-bottom:8px;font-weight:700;">
          Items
        </td>
      </tr>
      ${rows}
    </table>
  `;
}

function orderTotalsHtml(order) {
  const totals = order.totals || {};

  const rows = [
    infoRow(
      "Subtotal",
      formatMoney(totals.subtotal)
    ),
    infoRow(
      "Delivery",
      formatMoney(totals.shippingFee)
    )
  ];

  if (
    Number(totals.offerDiscount || 0) >
    0
  ) {
    rows.push(
      infoRow(
        "Automatic offers",
        `- ${formatMoney(
          totals.offerDiscount
        )}`
      )
    );
  }

  if (
    Number(totals.codeDiscount || 0) >
    0
  ) {
    rows.push(
      infoRow(
        "Discount code",
        `- ${formatMoney(
          totals.codeDiscount
        )}`
      )
    );
  }

  rows.push(
    infoRow(
      "Final total",
      formatMoney(totals.grandTotal)
    )
  );

  return infoTable(rows);
}

function orderAddressText(order) {
  const address =
    order.shippingAddress || {};

  return [
    address.addressLine,
    address.building
      ? `Building ${address.building}`
      : "",
    address.floor
      ? `Floor ${address.floor}`
      : "",
    address.apartment
      ? `Apartment ${address.apartment}`
      : "",
    address.area,
    address.city,
    address.governorate,
    address.landmark
      ? `Landmark: ${address.landmark}`
      : ""
  ]
    .filter(Boolean)
    .join(", ");
}

async function sendNewOrderAdminEmail(order) {
  const { adminEmail } =
    getEmailSettings();

  if (!adminEmail) {
    return;
  }

  const proofLink =
    order.payment?.proofImageUrl
      ? `<p style="margin:18px 0 0;"><a href="${escapeHtml(order.payment.proofImageUrl)}" style="color:#5a3d34;font-weight:700;">Open payment proof</a></p>`
      : "";

  const content = `
    ${infoTable([
      infoRow(
        "Order number",
        order.orderNumber
      ),
      infoRow(
        "Customer",
        order.customer?.fullName
      ),
      infoRow(
        "Phone",
        order.customer?.phone
      ),
      infoRow(
        "Payment",
        PAYMENT_METHOD_LABELS[
          order.payment?.method
        ] || order.payment?.method
      ),
      infoRow(
        "Payment status",
        PAYMENT_STATUS_LABELS[
          order.payment?.status
        ] || order.payment?.status
      ),
      infoRow(
        "Total",
        formatMoney(
          order.totals?.grandTotal
        )
      )
    ])}

    ${orderItemsHtml(order)}

    <div style="margin-top:20px;padding:18px;background:#fff8f4;border-radius:18px;line-height:1.7;">
      <strong>Delivery address</strong>
      <div style="margin-top:6px;color:#735f58;">
        ${escapeHtml(orderAddressText(order))}
      </div>
    </div>

    ${
      order.customerNote
        ? `
          <div style="margin-top:18px;padding:18px;background:#faf7f5;border-radius:18px;">
            <strong>Customer note</strong>
            <div style="margin-top:6px;color:#735f58;white-space:pre-wrap;">
              ${escapeHtml(order.customerNote)}
            </div>
          </div>
        `
        : ""
    }

    ${proofLink}
  `;

  return sendEmail({
    to: adminEmail,

    subject:
      `New order ${order.orderNumber} — ${formatMoney(
        order.totals?.grandTotal
      )}`,

    html: emailShell({
      eyebrow: "New store order",
      title:
        `New order ${order.orderNumber}`,
      intro:
        `${order.customer?.fullName} has placed a new Tap & Wrap order.`,
      content,
      actionLabel:
        "Open order in admin",
      actionUrl:
        getOrderAdminUrl(order)
    }),

    text:
      `New order ${order.orderNumber}\nCustomer: ${order.customer?.fullName}\nPhone: ${order.customer?.phone}\nTotal: ${formatMoney(order.totals?.grandTotal)}\nAdmin: ${getOrderAdminUrl(order)}`,

    replyTo:
      order.customer?.email
  });
}

async function sendOrderConfirmationEmail(order) {
  const content = `
    ${infoTable([
      infoRow(
        "Order number",
        order.orderNumber
      ),
      infoRow(
        "Status",
        ORDER_STATUS_LABELS[
          order.status
        ] || order.status
      ),
      infoRow(
        "Payment method",
        PAYMENT_METHOD_LABELS[
          order.payment?.method
        ] || order.payment?.method
      ),
      infoRow(
        "Payment status",
        PAYMENT_STATUS_LABELS[
          order.payment?.status
        ] || order.payment?.status
      ),
      infoRow(
        "Placed",
        formatDate(
          order.createdAt
        )
      )
    ])}

    ${orderItemsHtml(order)}

    <div style="margin-top:20px;">
      ${orderTotalsHtml(order)}
    </div>
  `;

  return sendEmail({
    to: order.customer?.email,

    subject:
      `We received your Tap & Wrap order ${order.orderNumber}`,

    html: emailShell({
      eyebrow:
        "Order confirmation",
      title:
        "Your order is with us.",
      intro:
        `Thanks ${order.customer?.fullName}. We received your order and will keep you updated as it moves forward.`,
      content,
      actionLabel:
        "Track your order",
      actionUrl:
        getOrderTrackingUrl(),
      footer:
        `Use order number ${order.orderNumber} and the same checkout email to track it.`
    }),

    text:
      `We received your order ${order.orderNumber}. Total: ${formatMoney(order.totals?.grandTotal)}. Track it at ${getOrderTrackingUrl()}`
  });
}

export function queueOrderCreatedNotifications(
  order
) {
  queueEmail(
    () =>
      sendNewOrderAdminEmail(
        order
      ),
    `Admin new-order email for ${order.orderNumber}`
  );

  queueEmail(
    () =>
      sendOrderConfirmationEmail(
        order
      ),
    `Customer order confirmation for ${order.orderNumber}`
  );
}

export function queueOrderStatusNotification({
  order,
  previousStatus
}) {
  if (
    previousStatus ===
    order.status
  ) {
    return;
  }

  queueEmail(
    () => {
      const label =
        ORDER_STATUS_LABELS[
          order.status
        ] || order.status;

      const cancellationText =
        order.status ===
          "cancelled" &&
        order.cancellationReason
          ? `
            <div style="margin-top:18px;padding:18px;background:#fff1f1;border-radius:18px;color:#8a1f1f;">
              <strong>Cancellation reason</strong>
              <div style="margin-top:6px;">
                ${escapeHtml(order.cancellationReason)}
              </div>
            </div>
          `
          : "";

      const content = `
        ${infoTable([
          infoRow(
            "Order number",
            order.orderNumber
          ),
          infoRow(
            "Previous status",
            ORDER_STATUS_LABELS[
              previousStatus
            ] || previousStatus
          ),
          infoRow(
            "Current status",
            label
          ),
          infoRow(
            "Updated",
            formatDate(
              order.updatedAt
            )
          )
        ])}

        ${cancellationText}
      `;

      return sendEmail({
        to: order.customer?.email,

        subject:
          `${label}: ${order.orderNumber}`,

        html: emailShell({
          eyebrow:
            "Order status update",
          title: label,
          intro:
            `Your Tap & Wrap order ${order.orderNumber} has been updated.`,
          content,
          actionLabel:
            "Track your order",
          actionUrl:
            getOrderTrackingUrl()
        }),

        text:
          `Order ${order.orderNumber} status changed from ${previousStatus} to ${order.status}. Track it at ${getOrderTrackingUrl()}`
      });
    },
    `Order status email for ${order.orderNumber}`
  );
}

export function queuePaymentStatusNotification({
  order,
  previousStatus
}) {
  if (
    previousStatus ===
    order.payment?.status
  ) {
    return;
  }

  queueEmail(
    () => {
      const label =
        PAYMENT_STATUS_LABELS[
          order.payment?.status
        ] || order.payment?.status;

      const content =
        infoTable([
          infoRow(
            "Order number",
            order.orderNumber
          ),
          infoRow(
            "Payment method",
            PAYMENT_METHOD_LABELS[
              order.payment?.method
            ] ||
              order.payment?.method
          ),
          infoRow(
            "Previous status",
            PAYMENT_STATUS_LABELS[
              previousStatus
            ] || previousStatus
          ),
          infoRow(
            "Current status",
            label
          ),
          infoRow(
            "Order total",
            formatMoney(
              order.totals
                ?.grandTotal
            )
          )
        ]);

      return sendEmail({
        to: order.customer?.email,

        subject:
          `Payment ${label.toLowerCase()} — ${order.orderNumber}`,

        html: emailShell({
          eyebrow:
            "Payment update",
          title:
            `Payment ${label.toLowerCase()}`,
          intro:
            `The payment status for order ${order.orderNumber} has changed.`,
          content,
          actionLabel:
            "Track your order",
          actionUrl:
            getOrderTrackingUrl()
        }),

        text:
          `Payment for order ${order.orderNumber} changed from ${previousStatus} to ${order.payment?.status}.`
      });
    },
    `Payment status email for ${order.orderNumber}`
  );
}

async function sendNewServiceRequestAdminEmail(
  request
) {
  const { adminEmail } =
    getEmailSettings();

  if (!adminEmail) {
    return;
  }

  const referenceLink =
    request.referenceImage
      ?.imageUrl
      ? `
        <p style="margin:18px 0 0;">
          <a href="${escapeHtml(request.referenceImage.imageUrl)}" style="color:#5a3d34;font-weight:700;">
            Open reference image
          </a>
        </p>
      `
      : "";

  const content = `
    ${infoTable([
      infoRow(
        "Request number",
        request.requestNumber
      ),
      infoRow(
        "Service",
        SERVICE_TYPE_LABELS[
          request.serviceType
        ] || request.serviceType
      ),
      infoRow(
        "Customer",
        request.customer
          ?.fullName
      ),
      infoRow(
        "Phone",
        request.customer?.phone
      ),
      infoRow(
        "Quantity",
        request.quantity
      ),
      infoRow(
        "Budget",
        request.budget ===
          null ||
        request.budget ===
          undefined
          ? "Not provided"
          : formatMoney(
              request.budget
            )
      )
    ])}

    <div style="margin-top:20px;padding:18px;background:#faf7f5;border-radius:18px;line-height:1.75;">
      <strong>${escapeHtml(request.title)}</strong>
      <div style="margin-top:8px;color:#735f58;white-space:pre-wrap;">
        ${escapeHtml(request.description)}
      </div>
    </div>

    ${referenceLink}
  `;

  return sendEmail({
    to: adminEmail,

    subject:
      `New service request ${request.requestNumber} — ${request.title}`,

    html: emailShell({
      eyebrow:
        "New custom request",
      title:
        request.title,
      intro:
        `${request.customer?.fullName} submitted a new Tap & Wrap service request.`,
      content,
      actionLabel:
        "Open request in admin",
      actionUrl:
        getServiceAdminUrl(
          request
        )
    }),

    text:
      `New service request ${request.requestNumber}: ${request.title}\nCustomer: ${request.customer?.fullName}\nPhone: ${request.customer?.phone}\nAdmin: ${getServiceAdminUrl(request)}`,

    replyTo:
      request.customer?.email
  });
}

async function sendServiceRequestAcknowledgement(
  request
) {
  const content =
    infoTable([
      infoRow(
        "Request number",
        request.requestNumber
      ),
      infoRow(
        "Service",
        SERVICE_TYPE_LABELS[
          request.serviceType
        ] || request.serviceType
      ),
      infoRow(
        "Title",
        request.title
      ),
      infoRow(
        "Quantity",
        request.quantity
      ),
      infoRow(
        "Status",
        SERVICE_STATUS_LABELS[
          request.status
        ] || request.status
      )
    ]);

  return sendEmail({
    to: request.customer?.email,

    subject:
      `We received your service request ${request.requestNumber}`,

    html: emailShell({
      eyebrow:
        "Custom request received",
      title:
        "We’ll review your idea.",
      intro:
        `Thanks ${request.customer?.fullName}. Tap & Wrap received your request and will contact you after reviewing the details.`,
      content,
      footer:
        `Keep request number ${request.requestNumber} for future reference.`
    }),

    text:
      `We received your Tap & Wrap service request ${request.requestNumber}: ${request.title}.`
  });
}

export function queueServiceRequestCreatedNotifications(
  request
) {
  queueEmail(
    () =>
      sendNewServiceRequestAdminEmail(
        request
      ),
    `Admin service-request email for ${request.requestNumber}`
  );

  queueEmail(
    () =>
      sendServiceRequestAcknowledgement(
        request
      ),
    `Customer service-request confirmation for ${request.requestNumber}`
  );
}

export function queueServiceRequestStatusNotification({
  request,
  previousStatus
}) {
  if (
    previousStatus ===
    request.status
  ) {
    return;
  }

  queueEmail(
    () => {
      const label =
        SERVICE_STATUS_LABELS[
          request.status
        ] || request.status;

      const quoteRows =
        request.status ===
          "quoted" &&
        request.quotedPrice !==
          null &&
        request.quotedPrice !==
          undefined
          ? [
              infoRow(
                "Quoted price",
                formatMoney(
                  request.quotedPrice
                )
              )
            ]
          : [];

      const content =
        infoTable([
          infoRow(
            "Request number",
            request.requestNumber
          ),
          infoRow(
            "Service",
            SERVICE_TYPE_LABELS[
              request.serviceType
            ] ||
              request.serviceType
          ),
          infoRow(
            "Previous status",
            SERVICE_STATUS_LABELS[
              previousStatus
            ] ||
              previousStatus
          ),
          infoRow(
            "Current status",
            label
          ),
          ...quoteRows
        ]);

      return sendEmail({
        to:
          request.customer?.email,

        subject:
          `${label}: service request ${request.requestNumber}`,

        html: emailShell({
          eyebrow:
            "Service request update",
          title: label,
          intro:
            `Your Tap & Wrap request "${request.title}" has been updated.`,
          content,
          footer:
            "Tap & Wrap will contact you directly when more information or confirmation is needed."
        }),

        text:
          `Service request ${request.requestNumber} changed from ${previousStatus} to ${request.status}.`
      });
    },
    `Service status email for ${request.requestNumber}`
  );
}
