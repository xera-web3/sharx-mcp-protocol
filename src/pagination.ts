/**
 * Cursor-based pagination envelope.
 * See api-contract-v2-2.md §A7.
 *
 * Default limit = 20, max = 100. Reject offset-style params.
 */
export type CursorPage<T> = {
  items: T[];
  next_cursor: string | null;
  limit: number;
};

export const DEFAULT_PAGE_LIMIT = 20;
export const MAX_PAGE_LIMIT = 100;
