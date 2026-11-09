import type { ImportItem } from '../../../shared/index';

export const REVIEW_PAGE_SIZE = 100;

export function filterReviewItems(items: ImportItem[], filter: string): ImportItem[] {
  return items.filter(
    (item) =>
      filter === 'all' ||
      (filter === 'duplicate'
        ? item.diagnostics.some((diagnostic) => diagnostic.code === 'DUPLICATE_IN_BANK')
        : item.status === filter),
  );
}

export function reviewPage<T>(items: readonly T[], requested: number) {
  const pages = Math.max(1, Math.ceil(items.length / REVIEW_PAGE_SIZE));
  const page = Math.max(0, Math.min(pages - 1, Math.trunc(requested) || 0));
  return {
    page,
    pages,
    total: items.length,
    items: items.slice(page * REVIEW_PAGE_SIZE, (page + 1) * REVIEW_PAGE_SIZE),
  };
}
