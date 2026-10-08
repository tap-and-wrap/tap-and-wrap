import { randomUUID } from 'node:crypto';
import { pathToFileURL } from 'node:url';
import { createGmailProvider } from '../src/email/gmail.js';
import { emailSettings, assertSafeEmailRecipient } from '../src/email/settings.js';

// Intentionally does not load dotenv, connect MongoDB or run on application start.
export function parseEmailSmokeArguments(args) {
  const options = { send: false, confirmSend: false, recipient: null };
  for (let index = 0; index < args.length; index += 1) {
    if (args[index] === '--send') options.send = true;
    else if (args[index] === '--confirm-send') options.confirmSend = true;
    else if (args[index] === '--recipient') options.recipient = args[++index];
    else if (args[index] === '--help') options.help = true;
    else throw new Error('Unknown email smoke-test argument.');
  }
  if (options.send && (!options.confirmSend || !options.recipient)) throw new Error('Sending requires --send --confirm-send --recipient.');
  return options;
}

export async function runEmailSmokeTest(options, settings = process.env) {
  if (!options.send) return { mode: 'dry-run', sent: false, databaseWrites: false };
  if (options.confirmSend !== true || settings.EMAIL_SMOKE_TEST_ENABLED !== 'true'
    || !['development', 'staging'].includes(settings.NODE_ENV || 'development') || process.env.NODE_ENV === 'test') throw new Error('Explicit developer email authorization is required.');
  const config = emailSettings(settings);
  if (config.provider !== 'gmail' || !config.enabled || !config.configured) throw new Error('Gmail email is not explicitly configured.');
  assertSafeEmailRecipient(options.recipient, { ...config, production: false });
  const provider = createGmailProvider(settings);
  try {
    await provider.send({ eventKey: `email-smoke:${randomUUID()}`, event: 'email_smoke_test', recipient: options.recipient, snapshot: {} });
    return { mode: 'explicit-developer-send', sent: true, databaseWrites: false };
  } finally { provider.close(); }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    const options = parseEmailSmokeArguments(process.argv.slice(2));
    if (options.help) console.log('Offline by default. One authorized message: --send --confirm-send --recipient <allowlisted-address> with explicit terminal Gmail and EMAIL_SMOKE_TEST_ENABLED=true settings.');
    else console.log(JSON.stringify(await runEmailSmokeTest(options), null, 2));
  } catch {
    console.error('Email smoke test did not send. Check explicit flags, Gmail settings and the recipient allowlist privately. Internal details are redacted.');
    process.exitCode = 1;
  }
}
