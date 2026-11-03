export const DEFAULT_PAGE_SIZE = 20;
export const MAX_PAGE_SIZE = 100;

export interface PageQuery {
  page?: unknown;
  pageSize?: unknown;
}

export interface Page<T> {
  items: T[];
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
}

export function parsePositiveInt(value: unknown, fallback: number): number {
  const num = Number.parseInt(String(value ?? ''), 10);
  return Number.isFinite(num) && num > 0 ? num : fallback;
}

export function normalizePageQuery(query: PageQuery = {}): {
  page: number;
  pageSize: number;
  skip: number;
  take: number;
} {
  const page = parsePositiveInt(query.page, 1);
  const pageSize = Math.min(parsePositiveInt(query.pageSize, DEFAULT_PAGE_SIZE), MAX_PAGE_SIZE);
  return {
    page,
    pageSize,
    skip: (page - 1) * pageSize,
    take: pageSize,
  };
}
