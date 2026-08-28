/**
 * Exponential backoff with a cap, for job retry scheduling (docs/REQUIREMENTS_MATRIX.md
 * #21). Pure function so retry timing is unit-testable without a real clock/DB.
 */
export function calculateBackoffMs(attempt: number, baseMs = 5_000, maxMs = 15 * 60_000): number {
  if (attempt < 1) throw new RangeError(`attempt must be >= 1, got ${attempt}`);
  const exponential = baseMs * 2 ** (attempt - 1);
  return Math.min(exponential, maxMs);
}
