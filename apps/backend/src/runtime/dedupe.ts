/**
 * Deduplication module for the event-driven runtime.
 *
 * Prevents the same event from triggering the same agent multiple times
 * within a configurable time window.
 *
 * SAFETY:
 * - Uses a bounded in-memory map with automatic TTL expiry.
 * - Keys are deterministically derived from event + agent identifiers.
 * - No external I/O — purely in-process state.
 */

// ─── Configuration ──────────────────────────────────────

/** Default deduplication window: 5 minutes */
const DEFAULT_TTL_MS = 5 * 60 * 1000;

/** Maximum entries before forced cleanup */
const MAX_ENTRIES = 10_000;

// ─── Store ──────────────────────────────────────────────

interface DedupeEntry {
  firstSeen: number;
  expiresAt: number;
}

const dedupeMap = new Map<string, DedupeEntry>();

// ─── Public API ─────────────────────────────────────────

/**
 * Build a deduplication key from event and agent identifiers.
 *
 * @param eventId    Unique event identifier
 * @param agentName  Agent that would process this event
 * @param extra      Optional extra discriminator (e.g. token+spender)
 */
export function dedupeKey(
  eventId: string,
  agentName: string,
  extra?: string,
): string {
  const parts = [eventId, agentName];
  if (extra) parts.push(extra);
  return parts.join(':');
}

/**
 * Check whether this key has already been processed.
 *
 * @returns true if the key is a duplicate (within TTL window)
 */
export function isDuplicate(key: string, ttlMs: number = DEFAULT_TTL_MS): boolean {
  cleanup();

  const entry = dedupeMap.get(key);
  if (!entry) return false;

  if (Date.now() > entry.expiresAt) {
    dedupeMap.delete(key);
    return false;
  }

  return true;
}

/**
 * Mark a key as processed.
 * Future calls to `isDuplicate` with the same key will return true
 * until the TTL expires.
 */
export function markProcessed(key: string, ttlMs: number = DEFAULT_TTL_MS): void {
  cleanup();

  const now = Date.now();
  dedupeMap.set(key, {
    firstSeen: now,
    expiresAt: now + ttlMs,
  });
}

/**
 * Check-and-mark in one atomic operation.
 *
 * @returns true if this is a NEW event (not duplicate) — the caller should process it.
 *          false if this is a duplicate — the caller should skip it.
 */
export function acquireOnce(key: string, ttlMs: number = DEFAULT_TTL_MS): boolean {
  if (isDuplicate(key, ttlMs)) return false;
  markProcessed(key, ttlMs);
  return true;
}

// ─── Maintenance ────────────────────────────────────────

/**
 * Remove expired entries and enforce max capacity.
 */
function cleanup(): void {
  if (dedupeMap.size < MAX_ENTRIES / 2) return; // Only clean when approaching limit

  const now = Date.now();
  for (const [key, entry] of dedupeMap) {
    if (now > entry.expiresAt) {
      dedupeMap.delete(key);
    }
  }

  // If still over limit, remove oldest entries
  if (dedupeMap.size > MAX_ENTRIES) {
    const entries = [...dedupeMap.entries()].sort(
      (a, b) => a[1].firstSeen - b[1].firstSeen,
    );
    const toRemove = entries.slice(0, dedupeMap.size - MAX_ENTRIES);
    for (const [key] of toRemove) {
      dedupeMap.delete(key);
    }
  }
}

/**
 * Get current deduplication store stats (for health checks).
 */
export function getDedupeStats(): { size: number; maxEntries: number } {
  return { size: dedupeMap.size, maxEntries: MAX_ENTRIES };
}
