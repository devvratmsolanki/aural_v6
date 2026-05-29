import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/**
 * Escape a search term for safe interpolation into a PostgREST `.ilike` pattern.
 * - `%` and `_` are SQL wildcard characters and must be escaped to be treated literally.
 * - `,` is the PostgREST `.or()` filter separator; if left unescaped it silently
 *   splits the filter expression and produces wrong results or an error.
 *
 * Usage: `.or(\`title.ilike.%${escapeLikePattern(term)}%,...\`)`
 */
export function escapeLikePattern(term: string): string {
  // Escape SQL LIKE wildcards first, then the PostgREST comma separator.
  return term.replace(/%/g, "\\%").replace(/_/g, "\\_").replace(/,/g, "\\,");
}

// Only UUID-shaped ids are safe to interpolate into PostgREST `in (...)` filters,
// so a stray value can never alter the filter expression.
export const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export const uuidList = (ids: string[]): string[] => ids.filter((id) => UUID_RE.test(id));
