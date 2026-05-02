export type Pagination = {
  page: number;
  pageSize: number;
  offset: number;
};

export function normalizePagination(
  page?: number,
  pageSize?: number,
  maxPageSize = 100,
): Pagination {
  const normalizedPage = Number.isFinite(page) && page && page > 0 ? Math.floor(page) : 1;
  const normalizedPageSize =
    Number.isFinite(pageSize) && pageSize && pageSize > 0
      ? Math.min(Math.floor(pageSize), maxPageSize)
      : 20;

  return {
    page: normalizedPage,
    pageSize: normalizedPageSize,
    offset: (normalizedPage - 1) * normalizedPageSize,
  };
}
