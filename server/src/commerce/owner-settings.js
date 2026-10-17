import { validEmail } from '../email/settings.js';
export function ownerSettings(settings = process.env) {
  const recipient = (settings.OWNER_NOTIFICATION_RECIPIENT || '').trim().toLowerCase();
  return { enabled: settings.OWNER_NOTIFICATIONS_ENABLED === 'true' && settings.OWNER_NOTIFICATION_RECIPIENT_CONFIRMED === 'true' && validEmail(recipient), recipient };
}
