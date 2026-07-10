import {
  getEmailSettings,
  getEmailTransporter,
  isEmailConfigured
} from "../config/email.js";

function normalizeRecipients(value) {
  if (!value) {
    return [];
  }

  const recipients = Array.isArray(value)
    ? value
    : String(value).split(",");

  return [
    ...new Set(
      recipients
        .map((recipient) =>
          String(recipient || "").trim()
        )
        .filter(Boolean)
    )
  ];
}

export async function sendEmail({
  to,
  subject,
  html,
  text,
  replyTo,
  attachments = []
}) {
  const recipients =
    normalizeRecipients(to);

  if (!recipients.length) {
    return {
      sent: false,
      skipped: true,
      reason: "No recipients"
    };
  }

  if (!isEmailConfigured()) {
    console.warn(
      `[email] Skipped "${subject}" because SMTP is not configured`
    );

    return {
      sent: false,
      skipped: true,
      reason: "SMTP not configured"
    };
  }

  const settings =
    getEmailSettings();

  const transporter =
    getEmailTransporter();

  const info =
    await transporter.sendMail({
      from: {
        name: settings.fromName,
        address: settings.fromAddress
      },

      to: recipients,
      subject,
      html,
      text,

      replyTo:
        replyTo ||
        settings.replyTo ||
        undefined,

      attachments
    });

  console.info(
    `[email] Sent "${subject}" to ${recipients.join(", ")}`
  );

  return {
    sent: true,
    skipped: false,
    messageId: info.messageId
  };
}

export function queueEmail(task, label) {
  Promise.resolve()
    .then(task)
    .catch((error) => {
      console.error(
        `[email] ${label} failed:`,
        error
      );
    });
}
