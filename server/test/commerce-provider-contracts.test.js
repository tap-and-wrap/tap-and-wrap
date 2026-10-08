import test from 'node:test';
import assert from 'node:assert/strict';
import { createR2Storage } from '../src/commerce/storage.js';
import { createResendProvider } from '../src/commerce/notifications.js';

test('offline SDK signing binds direct uploads to the approved type, size and short expiry', async () => {
  // Invented test credentials only. Signing is local; no request reaches R2.
  const adapter = createR2Storage({ STORAGE_ENABLED: 'true', R2_ACCOUNT_ID: '0'.repeat(32),
    R2_ACCESS_KEY_ID: 'isolated-test-access', R2_SECRET_ACCESS_KEY: 'isolated-test-secret', R2_BUCKET: 'isolated-commerce-files' });
  const signed = await adapter.signPut('temporary/commerce/isolated-fixture', { mimeType: 'image/png', sizeBytes: 123 });
  const url = new URL(signed.url);
  assert.equal(url.protocol, 'https:');
  assert.equal(url.searchParams.get('X-Amz-Expires'), '300');
  const headers = url.searchParams.get('X-Amz-SignedHeaders').split(';');
  assert.ok(headers.includes('content-type'));
  assert.ok(headers.includes('content-length'));
  assert.equal(signed.headers['Content-Type'], 'image/png');
  assert.equal(signed.expiresInSeconds, 300);
});

test('test processes cannot construct a live notification provider even with configured credentials', () => {
  const originalFetch = globalThis.fetch;
  let calls = 0;
  globalThis.fetch = async () => { calls += 1; throw new Error('External delivery must never be attempted in tests.'); };
  try {
    assert.throws(() => createResendProvider({ NOTIFICATIONS_ENABLED: 'true', RESEND_API_KEY: 'isolated-test-key',
      NOTIFICATION_FROM: 'Tap and Wrap <sender@example.test>', NOTIFICATION_SAFE_RECIPIENTS: 'safe@example.test', NODE_ENV: 'development', DATABASE_TARGET: 'staging' }), error => error.code === 'TEST_PROVIDER_NOT_CONFIGURED');
    assert.equal(calls, 0);
  } finally { globalThis.fetch = originalFetch; }
});
