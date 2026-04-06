import type { ListParams, PaginationMeta } from "./types";

/**
 * Builds a query string from list parameters (pagination, filtering, sorting).
 * @internal
 */
export function buildQueryString(params?: ListParams): string {
  if (!params) return "";

  const parts: string[] = [];

  // Pagination
  if (params.first != null) parts.push(`first=${params.first}`);
  if (params.after != null)
    parts.push(`after=${encodeURIComponent(params.after)}`);
  if (params.last != null) parts.push(`last=${params.last}`);
  if (params.before != null)
    parts.push(`before=${encodeURIComponent(params.before)}`);
  if (params.offset != null) parts.push(`offset=${params.offset}`);
  if (params.limit != null) parts.push(`limit=${params.limit}`);

  // Sorting
  if (params.orderBy) {
    for (const field of params.orderBy) {
      parts.push(`order_by[]=${encodeURIComponent(field)}`);
    }
  }
  if (params.orderDirections) {
    for (const dir of params.orderDirections) {
      parts.push(`order_directions[]=${dir}`);
    }
  }

  // Filters
  if (params.filters) {
    for (let i = 0; i < params.filters.length; i++) {
      const f = params.filters[i];
      parts.push(`filters[${i}][field]=${encodeURIComponent(f.field)}`);
      parts.push(`filters[${i}][op]=${encodeURIComponent(f.op)}`);
      parts.push(`filters[${i}][value]=${encodeURIComponent(f.value)}`);
    }
  }

  return parts.length > 0 ? `?${parts.join("&")}` : "";
}

/**
 * Maps a snake_case pagination meta object to camelCase.
 * @internal
 */
export function mapPaginationMeta(
  data: Record<string, unknown>
): PaginationMeta {
  return {
    total: data.total as number,
    hasNextPage: data.has_next_page as boolean,
    hasPreviousPage: data.has_previous_page as boolean,
    startCursor: (data.start_cursor as string) ?? null,
    endCursor: (data.end_cursor as string) ?? null,
    currentOffset: data.current_offset as number | null | undefined,
    currentPage: data.current_page as number | null | undefined,
    totalPages: data.total_pages as number | null | undefined,
  };
}
