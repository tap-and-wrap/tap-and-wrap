import "dotenv/config";

import {
  getEmailSettings,
  isEmailConfigured
} from "../config/email.js";

import {
  sendEmail
} from "../services/email.service.js";

async function main() {
  const settings =
    getEmailSettings();

  if (!isEmailConfigured()) {
    console.error(
      "SMTP is not configured. Add EMAIL_HOST, EMAIL_PORT, EMAIL_USER, EMAIL_PASS, and EMAIL_FROM_ADDRESS to server/.env."
    );

    process.exitCode = 1;
    return;
  }

  const recipient =
    process.argv[2] ||
    settings.adminEmail ||
    settings.fromAddress;

  const result =
    await sendEmail({
      to: recipient,

      subject:
        "Tap & Wrap email test",

      html: `
        <div style="font-family:Arial,sans-serif;padding:24px;">
          <h1>Tap & Wrap email is working.</h1>
          <p>Your SMTP configuration successfully sent this test message.</p>
        </div>
      `,

      text:
        "Tap & Wrap email is working."
    });

  console.log(result);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
