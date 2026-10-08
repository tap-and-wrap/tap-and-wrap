import test from 'node:test';
import assert from 'node:assert/strict';
import { emailSettings, assertSafeEmailRecipient } from '../src/email/settings.js';
import { renderEmailTemplate, EMAIL_TEMPLATE_EVENTS, safeClientOrigin } from '../src/email/templates.js';
import { createGmailProvider, classifySmtpFailure } from '../src/email/gmail.js';
import { sealActionToken, accountActionUrl } from '../src/email/action-secrets.js';
import { parseEmailSmokeArguments, runEmailSmokeTest } from '../scripts/email-smoke-test.js';

const settings = {
  EMAIL_PROVIDER: 'gmail', EMAIL_ENABLED: 'true', EMAIL_USER: 'sender@example.test',
  EMAIL_APP_PASSWORD: 'abcdefghijklmnop', EMAIL_FROM_NAME: 'Tap & Wrap',
  NOTIFICATION_SAFE_RECIPIENTS: 'safe@example.test', CLIENT_ORIGIN: 'http://localhost:5173',
  NODE_ENV: 'development', DATABASE_TARGET: 'staging',
};
const event = { eventKey: 'isolated-order:order_received:1', event: 'order_received', recipient: 'safe@example.test',
  snapshot: { orderNumber: '234567', totalPiastres: 14990, paymentMethod: 'instapay', proof: 'PRIVATE_PROOF', artwork: 'PRIVATE_ARTWORK', password: 'PRIVATE_PASSWORD' } };

test('Gmail uses one explicit email flag and keeps staging recipients allowlisted', () => {
  assert.equal(emailSettings({ ...settings, EMAIL_ENABLED: 'false', NOTIFICATIONS_ENABLED: 'true' }).enabled, false);
  assert.equal(emailSettings(settings).configured, true);
  assert.equal(emailSettings({ ...settings, EMAIL_APP_PASSWORD: '' }).configured, false);
  assert.equal(emailSettings({ ...settings, EMAIL_FROM_NAME: 'Tap\nBcc: victim@example.test' }).configured, false);
  const config = emailSettings({ ...settings, NODE_ENV: 'production', DATABASE_TARGET: 'staging', NOTIFICATION_LIVE_DELIVERY_ENABLED: 'true' });
  assert.equal(config.production, false);
  assert.doesNotThrow(() => assertSafeEmailRecipient('safe@example.test', config));
  assert.throws(() => assertSafeEmailRecipient('other@example.test', config), { code: 'UNSAFE_DEVELOPMENT_RECIPIENT' });
  assert.throws(() => assertSafeEmailRecipient('safe@example.test\r\nBcc: stolen@example.test', config), { code: 'INVALID_NOTIFICATION_RECIPIENT' });
});

test('every order and account event has branded HTML and plain text without private files', () => {
  for (const kind of EMAIL_TEMPLATE_EVENTS) {
    const actionUrl = `http://localhost:5173/${kind === 'password_reset' ? 'reset-password' : 'verify-email'}#token=${'a'.repeat(43)}`;
    const message = renderEmailTemplate({ ...event, event: kind }, { actionUrl });
    assert.ok(message.text.includes('Tap & Wrap'));
    assert.ok(message.html.includes('#795045'));
    assert.ok(message.subject.length > 5);
    for (const secret of ['PRIVATE_PROOF', 'PRIVATE_ARTWORK', 'PRIVATE_PASSWORD']) assert.equal(`${message.text}${message.html}`.includes(secret), false);
    assert.equal(message.html.includes('<script'), false);
  }
  const received = renderEmailTemplate(event);
  assert.ok(received.text.includes('EGP 149.90'));
  assert.ok(received.text.includes('awaiting manual verification'));
  assert.equal(received.text.includes('has manually confirmed'), false);
});

test('email links reject external origins, host-header injection and unapproved URL schemes', () => {
  assert.throws(() => safeClientOrigin('https://merchant.example/evil'), { code: 'INVALID_EMAIL_SITE_ORIGIN' });
  assert.throws(() => safeClientOrigin('http://merchant.example'), { code: 'INVALID_EMAIL_SITE_ORIGIN' });
  assert.throws(() => renderEmailTemplate({ ...event, event: 'password_reset' }, { actionUrl: `https://attacker.example/reset-password#token=${'a'.repeat(43)}` }), { code: 'INVALID_EMAIL_ACTION_LINK' });
  assert.throws(() => renderEmailTemplate({ ...event, event: '<script>' }), { code: 'INVALID_EMAIL_TEMPLATE' });
  assert.equal(safeClientOrigin('https://merchant.example'), 'https://merchant.example');
});

test('mocked SMTP uses the authenticated sender, strict TLS, compact private-free messages and stable IDs', async () => {
  const messages = [];
  let options;
  let closed = false;
  const provider = createGmailProvider(settings, { createTransport(config) {
    options = config;
    return { async sendMail(message) { messages.push(message); return { accepted: [message.to], rejected: [] }; }, close() { closed = true; } };
  } });
  const first = await provider.send(event);
  const second = await provider.send(event);
  assert.equal(first.id, second.id);
  assert.equal(provider.supportsIdempotency, false);
  assert.equal(options.auth.user, settings.EMAIL_USER);
  assert.equal(options.service, 'gmail');
  assert.equal(options.tls.rejectUnauthorized, true);
  assert.equal(options.maxConnections, 1);
  assert.equal(options.maxRequeues, 0);
  assert.equal(options.rateLimit, 1);
  assert.equal(options.disableUrlAccess, true);
  assert.equal(options.disableFileAccess, true);
  assert.equal(options.logger, false);
  assert.deepEqual(messages[0].from, { name: 'Tap & Wrap', address: settings.EMAIL_USER });
  assert.deepEqual(messages[0].envelope, { from: settings.EMAIL_USER, to: ['safe@example.test'] });
  assert.equal(Object.hasOwn(messages[0], 'attachments'), false);
  assert.equal(JSON.stringify(messages[0]).includes('abcdefghijklmnop'), false);
  provider.close(); assert.equal(closed, true);
});

test('a test process cannot construct a live SMTP transporter', () => {
  assert.throws(() => createGmailProvider(settings), { code: 'TEST_PROVIDER_NOT_CONFIGURED' });
  assert.throws(() => createGmailProvider({ ...settings, EMAIL_ENABLED: 'false' }, { createTransport() { throw new Error('Must not construct.'); } }), { code: 'NOTIFICATIONS_DISABLED' });
});

test('SMTP failures are redacted and distinguish retryable failures from uncertain or permanent delivery', async () => {
  assert.equal(classifySmtpFailure({ code: 'ECONNECTION', command: 'CONN' }).code, 'SMTP_DELIVERY_UNCERTAIN');
  assert.equal(classifySmtpFailure({ code: 'ESOCKET', command: 'CONN', responseCode: 450 }).code, 'SMTP_TRANSIENT_FAILURE');
  assert.equal(classifySmtpFailure({ code: 'EAUTH', response: 'secret-auth-response' }).terminal, true);
  assert.equal(classifySmtpFailure({ command: 'DATA', responseCode: 450 }).terminal, false);
  assert.equal(classifySmtpFailure({ command: 'DATA', responseCode: 550 }).code, 'SMTP_MESSAGE_REJECTED');
  assert.equal(classifySmtpFailure({ command: 'DATA', code: 'ETIMEDOUT' }).code, 'SMTP_DELIVERY_UNCERTAIN');
  const provider = createGmailProvider(settings, { createTransport: () => ({ sendMail: async () => { throw { command: 'DATA', code: 'ETIMEDOUT', response: 'secret-password' }; } }) });
  await assert.rejects(provider.send(event), error => error.code === 'SMTP_DELIVERY_UNCERTAIN' && !error.message.includes('secret-password'));
});

for (const failure of [
  ...['ETIMEDOUT', 'ESOCKET', 'ECONNECTION', 'ECONNRESET', 'EPIPE'].map(code => ({ code, command: 'CONN' })),
  { command: 'DATA' },
]) {
  test(`mocked SMTP ${failure.code || 'DATA without response'} cannot automatically retry an ambiguous delivery`, async () => {
    const provider = createGmailProvider(settings, { createTransport: () => ({
      async sendMail() { throw { ...failure, message: 'private SMTP body', response: 'private SMTP response' }; },
    }) });
    await assert.rejects(provider.send(event), error => error.code === 'SMTP_DELIVERY_UNCERTAIN'
      && error.terminal === true && !error.message.includes('private SMTP'));
    provider.close();
  });
}

test('account-action tokens are encrypted with event-bound authentication and URLs use fragments', () => {
  const token = 'a'.repeat(43);
  const sealedActionToken = sealActionToken(token, 'account-event');
  assert.equal(sealedActionToken.includes(token), false);
  const url = new URL(accountActionUrl({ event: 'password_reset', eventKey: 'account-event', sealedActionToken }));
  assert.equal(url.pathname, '/reset-password');
  assert.equal(url.search, '');
  assert.equal(url.hash, `#token=${token}`);
  assert.throws(() => accountActionUrl({ event: 'password_reset', eventKey: 'different-event', sealedActionToken }), { code: 'INVALID_ACCOUNT_ACTION_SECRET' });
  assert.equal(accountActionUrl(event), undefined);
});

test('developer email smoke test is offline by default and cannot send under test or incomplete authorization', async () => {
  assert.deepEqual(await runEmailSmokeTest(parseEmailSmokeArguments([])), { mode: 'dry-run', sent: false, databaseWrites: false });
  assert.throws(() => parseEmailSmokeArguments(['--send']), /Sending requires/);
  assert.throws(() => parseEmailSmokeArguments(['--unexpected']), /Unknown/);
  await assert.rejects(runEmailSmokeTest({ send: true, confirmSend: true, recipient: 'safe@example.test' }, { ...settings, EMAIL_SMOKE_TEST_ENABLED: 'true' }), /authorization/);
});
