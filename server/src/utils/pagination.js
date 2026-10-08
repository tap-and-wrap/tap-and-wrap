export const PAGE_SIZE = 20;
export function getPagination(input) {
  const page = Number(input ?? 1);
  if (!Number.isSafeInteger(page) || page < 1 || page > 100_000) throw new Error('Invalid page');
  return { page, limit: PAGE_SIZE, skip: (page - 1) * PAGE_SIZE };
}
