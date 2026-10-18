import { emailReadiness } from './settings.js';
import { runNotificationBatch } from '../commerce/notifications.js';
import { createWorkBudget } from '../commerce/work-budget.js';

/** Opt-in SMTP processing inside the existing API process; no separate Render service.
 * Delivery remains outbox-backed and crash/SMTP uncertainty is handled by the
 * existing durable claim, lease and manual-review rules. */
export function inlineEmailReady(settings = process.env) {
  const ready = emailReadiness(settings);
  return settings.INLINE_EMAIL_DISPATCH_ENABLED === 'true'
    && settings.NODE_ENV === 'production'
    && settings.DATABASE_TARGET === 'production'
    && settings.PRODUCTION_DATABASE_AUTHORIZED === 'true'
    && ready.deliveryReady && ready.liveDeliveryAuthorized;
}

export function startInlineEmailDispatch({ settings = process.env,
  dispatch = runNotificationBatch, everyMs = 15_000,
  startTimer = setInterval, clearTimer = clearInterval, logger = console } = {}) {
  if (process.env.NODE_ENV !== 'test' && (dispatch !== runNotificationBatch
    || startTimer !== setInterval || clearTimer !== clearInterval)) {
    throw new Error('Inline email adapters are test-only.');
  }
  if (!inlineEmailReady(settings)) return { enabled: false, stop() {} };
  if (!Number.isInteger(everyMs) || everyMs < 10_000 || everyMs > 60_000) {
    throw new Error('Invalid inline email interval.');
  }
  let stopped = false;
  let busy = false;
  const tick = async () => {
    if (stopped || busy) return;
    busy = true;
    try {
      const result = await dispatch({ batchSize: 5, now: new Date(),
        budget: createWorkBudget({ maxDurationMs: 50_000 }) });
      if (result.claimed || result.failed || result.uncertain || result.dead) {
        logger.log(JSON.stringify({ event: 'inline_email_cycle',
          claimed: result.claimed || 0, sent: result.sent || 0,
          failed: result.failed || 0, uncertain: result.uncertain || 0,
          dead: result.dead || 0 }));
      }
    } catch {
      // Never log MongoDB URLs, customer addresses, provider responses or credentials.
      logger.error(JSON.stringify({ event: 'inline_email_cycle_failed', code: 'EMAIL_DISPATCH_FAILED' }));
    } finally {
      busy = false;
    }
  };
  const timer = startTimer(() => { void tick(); }, everyMs);
  timer?.unref?.();
  void tick(); // First safe batch after successful database startup.
  return { enabled: true, stop() { stopped = true; clearTimer(timer); } };
}
