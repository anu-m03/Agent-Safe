/**
 * Execution guardrails — deadline sanity and shared checks for swap/calldata builders.
 * Used by executionService and any path that builds or accepts swap calldata.
 * All validators throw or return false on failure (caller must BLOCK execution).
 */

/** Max allowed deadline offset from now (seconds). Reject deadlines > 30 min in the future. */
export const MAX_DEADLINE_OFFSET_SEC = 30 * 60;

/**
 * Validate that a swap deadline (Unix timestamp in seconds) is within allowed window.
 * Returns false if deadline is too far in the future (possible abuse) or in the past.
 * Call this when building or accepting swap calldata that includes a deadline parameter.
 */
export function validateDeadline(deadlineTimestampSec: number): boolean {
  const now = Math.floor(Date.now() / 1000);
  if (deadlineTimestampSec < now) return false;
  if (deadlineTimestampSec > now + MAX_DEADLINE_OFFSET_SEC) return false;
  return true;
}
