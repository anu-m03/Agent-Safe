/**
 * Replay protection for x402: each payment tx hash may only be used once (within TTL).
 * In-memory, bounded. Used by verifyPaymentWithTxHash before running paid actions.
 */

const TTL_MS = Number(process.env.X402_PAYMENT_TTL_MS ?? '3600000'); // 1 hour default
const MAX_ENTRIES = Number(process.env.X402_USED_PAYMENTS_MAX ?? '10000');

const used = new Map<string, number>();

function prune(): void {
  if (used.size <= MAX_ENTRIES) return;
  const now = Date.now();
  const sorted = [...used.entries()].sort((a, b) => a[1] - b[1]);
  for (const [key, expiry] of sorted) {
    if (used.size <= MAX_ENTRIES * 0.8) break;
    if (expiry <= now) used.delete(key);
    else break; // rest are newer
  }
}

/**
 * Returns true if txHash was already used for a paid action (and not expired).
 */
export function isPaymentUsed(txHash: string): boolean {
  const normalized = txHash.toLowerCase().trim();
  const expiry = used.get(normalized);
  if (expiry === undefined) return false;
  if (expiry <= Date.now()) {
    used.delete(normalized);
    return false;
  }
  return true;
}

/**
 * Mark txHash as used. Call only after verification succeeded.
 */
export function markPaymentUsed(txHash: string): void {
  const normalized = txHash.toLowerCase().trim();
  used.set(normalized, Date.now() + TTL_MS);
  prune();
}
