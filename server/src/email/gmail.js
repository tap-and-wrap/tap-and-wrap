import { createHash } from 'node:crypto';
import nodemailer from 'nodemailer';
import { emailSettings, assertSafeEmailRecipient, emailError } from './settings.js';
import { renderEmailTemplate } from './templates.js';

export function classifySmtpFailure(error) {
  if (error?.code === 'EAUTH' || error?.code === 'ENOAUTH') return emailError('SMTP_AUTHENTICATION_FAILED', { terminal: true });
  // Nodemailer labels socket timeouts/closures CONN even after the final DATA
  // stream. Without a server response, transport errors cannot prove that the
  // message was rejected; stop automatic retries for operator review.
  const ambiguousTransport = ['ETIMEDOUT', 'ESOCKET', 'ECONNECTION', 'ECONNRESET', 'EPIPE'].includes(error?.code);
  if (!Number.isInteger(error?.responseCode) && (ambiguousTransport || String(error?.command || '').toUpperCase().includes('DATA'))) {
    return emailError('SMTP_DELIVERY_UNCERTAIN', { terminal: true });
  }
  if (Number.isInteger(error?.responseCode) && error.responseCode >= 500) return emailError('SMTP_MESSAGE_REJECTED', { terminal: true });
  return emailError('SMTP_TRANSIENT_FAILURE');
}

export function createGmailProvider(settings = process.env, { createTransport, render = renderEmailTemplate } = {}) {
  const testing = process.env.NODE_ENV === 'test';
  if (testing && typeof createTransport !== 'function') throw emailError('TEST_PROVIDER_NOT_CONFIGURED');
  if (!testing && createTransport) throw emailError('TEST_TRANSPORT_FORBIDDEN');
  const config = emailSettings(settings);
  if (config.provider !== 'gmail' || !config.enabled || !config.configured || (!config.production && !config.safeRecipients.length)) throw emailError('NOTIFICATIONS_DISABLED');
  const transport = (createTransport || nodemailer.createTransport)({
    service: 'gmail', pool: true, maxConnections: 1, maxMessages: 50, maxRequeues: 0,
    rateLimit: 1, rateDelta: 1000, connectionTimeout: 10000, greetingTimeout: 10000, socketTimeout: 15000,
    secure: true, tls: { rejectUnauthorized: true },
    auth: { user: config.from, pass: settings.EMAIL_APP_PASSWORD.replace(/\s/g, '') },
    logger: false, debug: false, disableFileAccess: true, disableUrlAccess: true, maxRecipients: 1,
  });
  return {
    supportsIdempotency: false,
    async send(event, options = {}) {
      assertSafeEmailRecipient(event.recipient, config);
      if (typeof event.eventKey !== 'string' || event.eventKey.length > 180) throw emailError('INVALID_EMAIL_EVENT', { terminal: true });
      const message = render(event, { clientOrigin: settings.CLIENT_ORIGIN || 'http://localhost:5173', ...options });
      const messageId = `<${createHash('sha256').update(event.eventKey).digest('hex')}@${config.from.split('@')[1]}>`;
      try {
        const result = await transport.sendMail({
          from: { name: config.fromName, address: config.from }, to: event.recipient,
          envelope: { from: config.from, to: [event.recipient] },
          subject: message.subject, text: message.text, html: message.html, messageId,
          disableFileAccess: true, disableUrlAccess: true,
        });
        if (!result || (Array.isArray(result.rejected) && result.rejected.length) || !Array.isArray(result.accepted)
          || !result.accepted.some(address => String(address).toLowerCase() === event.recipient.toLowerCase())) throw emailError('SMTP_MESSAGE_REJECTED', { terminal: true });
        return { id: messageId };
      } catch (error) {
        if (error?.code?.startsWith('SMTP_')) throw error;
        throw classifySmtpFailure(error);
      }
    },
    close() { transport.close?.(); },
  };
}
