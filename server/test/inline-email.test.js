import test from 'node:test';
import assert from 'node:assert/strict';
import { inlineEmailReady, startInlineEmailDispatch } from '../src/email/inline-dispatch.js';

const enabled = Object.freeze({
  INLINE_EMAIL_DISPATCH_ENABLED: 'true', NODE_ENV: 'production',
  DATABASE_TARGET: 'production', PRODUCTION_DATABASE_AUTHORIZED: 'true',
  NOTIFICATION_LIVE_DELIVERY_ENABLED: 'true',
  NOTIFICATION_DELIVERY_NOT_BEFORE: '2026-10-18T12:00:00Z',
  EMAIL_PROVIDER: 'gmail', EMAIL_ENABLED: 'true',
  EMAIL_USER: 'synthetic-sender@example.test',
  EMAIL_APP_PASSWORD: 'abcdefghijklmnop', EMAIL_FROM_NAME: 'Tap & Wrap',
});

test('inline Gmail dispatch is off by default and needs explicit, validated production activation', () => {
  assert.equal(inlineEmailReady({ ...enabled, INLINE_EMAIL_DISPATCH_ENABLED: 'false' }), false);
  assert.equal(inlineEmailReady({ ...enabled, EMAIL_ENABLED: 'false' }), false);
  assert.equal(inlineEmailReady({ ...enabled, NOTIFICATION_LIVE_DELIVERY_ENABLED: 'false' }), false);
  assert.equal(inlineEmailReady({ ...enabled, NOTIFICATION_DELIVERY_NOT_BEFORE: '' }), false);
  assert.equal(inlineEmailReady({ ...enabled, DATABASE_TARGET: 'staging' }), false);
  assert.equal(inlineEmailReady({ ...enabled, PRODUCTION_DATABASE_AUTHORIZED: 'false' }), false);
  assert.equal(inlineEmailReady(enabled), true);
});

test('disabled process neither schedules work nor sends mail', () => {
  let started = 0, dispatched = 0;
  const scheduler = startInlineEmailDispatch({ settings: { ...enabled, INLINE_EMAIL_DISPATCH_ENABLED: 'false' },
    dispatch: async () => { dispatched++; }, startTimer: () => { started++; } });
  assert.equal(scheduler.enabled, false);
  assert.equal(started, 0); assert.equal(dispatched, 0);
  scheduler.stop();
});

test('in-process polling starts after authorization, never overlaps and stops cleanly', async () => {
  let callback, cancelled = 0, started = 0, completed = 0, releaseFirst;
  const wait = new Promise(resolve => { releaseFirst = resolve; });
  const messages = [];
  const worker = startInlineEmailDispatch({ settings: enabled,
    startTimer(fn, interval) { assert.equal(interval, 15_000); callback = fn; return { unref() {} }; },
    clearTimer() { cancelled++; },
    logger: { log(message) { messages.push(JSON.parse(message)); }, error() { assert.fail('No error expected'); } },
    async dispatch(args) {
      started++;
      assert.equal(args.batchSize, 5);
      assert.ok(args.now instanceof Date);
      assert.ok(args.budget.deadline > Date.now());
      if (started === 1) await wait;
      completed++;
      return { claimed: 1, sent: 1 };
    },
  });
  assert.equal(worker.enabled, true);
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(started, 1);
  callback();
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(started, 1, 'Overlapping email cycles must never start');
  releaseFirst();
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(completed, 1);
  callback();
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(started, 2); assert.equal(completed, 2);
  worker.stop(); callback();
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(started, 2); assert.equal(cancelled, 1);
  assert.equal(messages.length, 2);
  assert.deepEqual(Object.keys(messages[0]).sort(), ['claimed','dead','event','failed','sent','uncertain']);
});
