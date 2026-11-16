export function resolveGiftBoxEstimate(query, { hasSelection, unavailable, now = Date.now() }) {
  const amount = query.data?.componentSubtotalPiastres;
  const matches = hasSelection && !unavailable && !query.isPlaceholderData && !query.isError
    && Number.isSafeInteger(amount) && amount >= 0;
  const safeRefresh = !query.isFetching || now - query.dataUpdatedAt <= 30_000;
  const display = matches && safeRefresh ? query.data : null;
  return { display, authoritative: display && query.isSuccess && !query.isFetching ? display : null };
}
