/** Shared cooperative deadline. No scheduled jobs or providers are enabled here. */
export function createWorkBudget({ maxDurationMs = 60000, signal, clock = () => Date.now() } = {}) {
  if (!Number.isInteger(maxDurationMs) || maxDurationMs < 100 || maxDurationMs > 600000 || typeof clock !== 'function') throw new Error('Worker duration must be between 100 and 600000 milliseconds.');
  return { deadline: clock() + maxDurationMs, signal, clock };
}
export function remainingBudgetMs(budget) {
  if (!budget) return Infinity;
  return budget.signal?.aborted ? 0 : Math.max(0, budget.deadline - budget.clock());
}
export function shouldStop(budget) { return remainingBudgetMs(budget) <= 0; }

/** Abort-capable adapters receive a signal. Racing also bounds faulty synthetic
 * adapters; callers must treat dispatched non-idempotent delivery as uncertain. */
export async function boundedOperation(operation, { timeoutMs = 15000, budget, code = 'PROVIDER_TIMEOUT' } = {}) {
  const duration = Math.min(timeoutMs, remainingBudgetMs(budget));
  const controller = new AbortController();
  let timer;
  let abort;
  const timeout = new Promise((resolve, reject) => {
    abort = () => {
      controller.abort();
      reject(Object.assign(new Error('The operation did not complete within its safe deadline.'), { code, status: 503 }));
    };
    if (duration <= 0) abort();
    else { timer = setTimeout(abort, duration); budget?.signal?.addEventListener('abort', abort, { once: true }); }
  });
  try {
    if (controller.signal.aborted) return await timeout;
    return await Promise.race([Promise.resolve().then(() => operation(controller.signal)), timeout]);
  } finally {
    clearTimeout(timer);
    budget?.signal?.removeEventListener('abort', abort);
  }
}
