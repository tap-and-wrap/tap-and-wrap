// Backend-only configuration. Never return credentials or this object to clients.
export function validEmail(value) {
  return typeof value === 'string' && value.length <= 254 && /^[^\s@<>\r\n]+@[^\s@<>\r\n]+\.[^\s@<>\r\n]+$/.test(value);
}

export function emailSettings(settings = process.env) {
  const provider = settings.EMAIL_PROVIDER || 'resend';
  const user = (settings.EMAIL_USER || '').trim().toLowerCase();
  const fromName = (settings.EMAIL_FROM_NAME || 'Tap & Wrap').trim();
  const legacyFrom = settings.NOTIFICATION_FROM || '';
  const legacyAddress = legacyFrom.match(/<([^<>]+)>$/)?.[1] || legacyFrom;
  const resendKeyConfigured = typeof settings.RESEND_API_KEY === 'string' && /^[^\s]{1,512}$/.test(settings.RESEND_API_KEY) && !/^REPLACE_/i.test(settings.RESEND_API_KEY);
  const gmailConfigured = validEmail(user) && typeof settings.EMAIL_APP_PASSWORD === 'string'
    && /^[A-Za-z0-9]{16}$/.test(settings.EMAIL_APP_PASSWORD.replace(/\s/g, ''))
    && fromName.length > 0 && fromName.length <= 100 && !/[\r\n]/.test(fromName);
  return {
    provider,
    enabled: provider === 'gmail' ? settings.EMAIL_ENABLED === 'true' : settings.NOTIFICATIONS_ENABLED === 'true',
    configured: provider === 'gmail' ? gmailConfigured
      : provider === 'resend' && Boolean(resendKeyConfigured && validEmail(legacyAddress) && !/[\r\n]/.test(legacyFrom)),
    production: settings.NODE_ENV === 'production' && settings.DATABASE_TARGET === 'production'
      && settings.NOTIFICATION_LIVE_DELIVERY_ENABLED === 'true',
    safeRecipients: (settings.NOTIFICATION_SAFE_RECIPIENTS || '').split(',')
      .map(value => value.trim().toLowerCase()).filter(validEmail),
    from: provider === 'gmail' ? user : legacyFrom,
    fromName,
    deliveryNotBefore: /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z$/.test(settings.NOTIFICATION_DELIVERY_NOT_BEFORE || '') && Number.isFinite(Date.parse(settings.NOTIFICATION_DELIVERY_NOT_BEFORE)) ? new Date(settings.NOTIFICATION_DELIVERY_NOT_BEFORE) : null,
  };
}

// Boolean/status diagnostics only. No sender, recipient or credential values.
export function emailReadiness(settings = process.env) {
  const config = emailSettings(settings);
  return { provider: ['gmail', 'resend'].includes(config.provider) ? config.provider : 'invalid', enabled: config.enabled, configured: config.configured,
    liveDeliveryAuthorized: config.production, restrictedRecipientsConfigured: config.safeRecipients.length > 0,
    activationCutoffConfigured: Boolean(config.deliveryNotBefore), deliveryReady: config.enabled && config.configured && Boolean(config.deliveryNotBefore) && (config.production || config.safeRecipients.length > 0) };
}

export function emailError(code, { terminal = false, status = 503 } = {}) {
  const error = new Error('Email delivery is unavailable.');
  Object.assign(error, { code, terminal, status });
  return error;
}

export function assertSafeEmailRecipient(recipient, config = emailSettings()) {
  if (!validEmail(recipient)) throw emailError('INVALID_NOTIFICATION_RECIPIENT', { status: 400, terminal: true });
  if (!config.production && !config.safeRecipients.includes(recipient.toLowerCase())) {
    throw emailError('UNSAFE_DEVELOPMENT_RECIPIENT', { terminal: true });
  }
}
