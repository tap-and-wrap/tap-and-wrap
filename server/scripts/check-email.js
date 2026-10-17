import { pathToFileURL } from 'node:url';
import { emailReadiness } from '../src/email/settings.js';
import { ownerSettings } from '../src/commerce/owner-settings.js';

export function checkEmailConfiguration(settings = process.env) {
  return { mode: 'offline', connected: false, sent: false, ...emailReadiness(settings), ownerAlertsConfigured: ownerSettings(settings).enabled };
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) console.log(JSON.stringify(checkEmailConfiguration(), null, 2));
