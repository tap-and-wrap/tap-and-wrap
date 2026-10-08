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
  const gmailConfigured = validEmail(user) && typeof settings.EMAIL_APP_PASSWORD === 'string'
    && /^[A-Za-z0-9]{16}$/.test(settings.EMAIL_APP_PASSWORD.replace(/\s/g, ''))
    && fromName.length > 0 && fromName.length <= 100 && !/[\r\n]/.test(fromName);
  return {
    provider,
    enabled: provider === 'gmail' ? settings.EMAIL_ENABLED === 'true' : settings.NOTIFICATIONS_ENABLED === 'true',
    configured: provider === 'gmail' ? gmailConfigured
      : provider === 'resend' && Boolean(settings.RESEND_API_KEY && validEmail(legacyAddress) && !/[\r\n]/.test(legacyFrom)),
    production: settings.NODE_ENV === 'production' && settings.DATABASE_TARGET === 'production'
      && settings.NOTIFICATION_LIVE_DELIVERY_ENABLED === 'true',
    safeRecipients: (settings.NOTIFICATION_SAFE_RECIPIENTS || '').split(',')
      .map(value => value.trim().toLowerCase()).filter(validEmail),
    from: provider === 'gmail' ? user : legacyFrom,
    fromName,
  };
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
