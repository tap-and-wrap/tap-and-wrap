import { emailSettings, emailError, assertSafeEmailRecipient } from './settings.js';
import { renderEmailTemplate } from './templates.js';

export function createResendProvider(settings = process.env, { request } = {}) {
  if (process.env.NODE_ENV === 'test' && typeof request !== 'function') throw emailError('TEST_PROVIDER_NOT_CONFIGURED');
  if (process.env.NODE_ENV !== 'test' && request) throw emailError('TEST_TRANSPORT_FORBIDDEN');
  const config = emailSettings({ ...settings, EMAIL_PROVIDER: 'resend' });
  if (!config.enabled || !config.configured || (!config.production && !config.safeRecipients.length)) {
    throw emailError('NOTIFICATIONS_DISABLED');
  }
  return {
    supportsIdempotency: true,
    async send(event, options = {}) {
      assertSafeEmailRecipient(event.recipient, config);
      const message = renderEmailTemplate(event, { clientOrigin: settings.CLIENT_ORIGIN || 'http://localhost:5173', ...options });
      let response;
      try {
        response = await (request || fetch)('https://api.resend.com/emails', {
          method: 'POST', signal: options.signal ? AbortSignal.any([options.signal, AbortSignal.timeout(15000)]) : AbortSignal.timeout(15000),
          headers: { Authorization: `Bearer ${settings.RESEND_API_KEY}`, 'Content-Type': 'application/json', 'Idempotency-Key': event.eventKey },
          body: JSON.stringify({ from: config.from, to: [event.recipient], ...message }),
        });
      } catch { throw Object.assign(emailError('DELIVERY_UNCERTAIN'), { terminal: true }); }
      if (response.status === 429) throw emailError('PROVIDER_RATE_LIMIT');
      if (!response.ok) throw Object.assign(emailError(response.status >= 500 ? 'DELIVERY_UNCERTAIN' : 'SMTP_MESSAGE_REJECTED'), { terminal: true });
      let result;
      try { result = await response.json(); } catch { throw Object.assign(emailError('DELIVERY_UNCERTAIN'), { terminal: true }); }
      if (typeof result.id !== 'string' || result.id.length > 180) throw Object.assign(emailError('DELIVERY_UNCERTAIN'), { terminal: true });
      return { id: result.id };
    },
  };
}

