/** Shared utility functions for hub-console. */

/**
 * Split a comma-separated string into a trimmed, non-empty string array.
 * Used for tag / collaborator / skill input fields.
 */
export function parseList(csv: string): string[] {
  return csv
    .split(',')
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
}

/**
 * Extract a human-readable message from an unknown thrown value.
 */
export function errorDetail(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

/**
 * Return the CSS class string for a segmented-control button.
 * active=true  → 'seg__btn seg__btn--active'
 * active=false → 'seg__btn'
 */
export function segClass(active: boolean): string {
  return active ? 'seg__btn seg__btn--active' : 'seg__btn';
}
