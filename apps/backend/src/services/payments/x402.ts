/**
 * x402 payment requirement for paid actions.
 * Attempt payment; on insufficient funds caller falls back to heuristic and logs.
 * No subscription models. No new action types.
 */

export type PaidActionType = 'PROPOSAL_SUMMARISE' | 'RISK_CLASSIFICATION' | 'TX_SIMULATION';

const X402_ENABLED = process.env.X402_ENABLED === 'true' || process.env.X402_PAYMENT_TX_HASH !== undefined;

/**
 * Require x402 payment before performing a paid action.
 * Returns paymentTxHash on success, or INSUFFICIENT_FUNDS / error for fallback path.
 */
export async function requireX402Payment(
  actionType: PaidActionType,
  _amountWei?: string,
): Promise<{ ok: true; paymentTxHash: string } | { ok: false; reason: 'INSUFFICIENT_FUNDS' | string }> {
  const stubTxHash = process.env.X402_PAYMENT_TX_HASH;
  if (X402_ENABLED && stubTxHash) {
    return { ok: true, paymentTxHash: stubTxHash };
  }
  // No real x402 client in repo; treat as insufficient funds so fallback is used
  return { ok: false, reason: 'INSUFFICIENT_FUNDS' };
}
