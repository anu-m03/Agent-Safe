/**
 * x402 payment requirement for paid actions.
 * Production path: verified USDC payment on Base (via payment context set by HTTP layer).
 * Stub path: env X402_PAYMENT_TX_HASH for testing. No subscription models; no new action types.
 */

import { appendLog, createLogEvent } from '../../storage/logStore.js';
import { getPaymentContext } from './paymentContext.js';
import {
  isX402RealEnabled,
  getOperatorWallet,
  getUsdcAddress,
  getRequiredAmountWei,
  getBaseRpcUrl,
} from './x402Config.js';
import { verifyPaymentOnBase } from './verifyPayment.js';
import { isPaymentUsed, markPaymentUsed } from './usedPayments.js';

export type { PaidActionType } from './x402Config.js';
import type { PaidActionType } from './x402Config.js';

const STUB_ENABLED =
  process.env.X402_ENABLED === 'true' || process.env.X402_PAYMENT_TX_HASH !== undefined;

/** Success return: paymentTxHash and amountWei for logging. Callers may ignore amountWei. */
export type X402Success = { ok: true; paymentTxHash: string; amountWei: string };
export type X402Failure = { ok: false; reason: 'INSUFFICIENT_FUNDS' | string };
export type RequireX402Result = X402Success | X402Failure;

/**
 * Require x402 payment before performing a paid action.
 * Returns paymentTxHash (and amountWei) on success; INSUFFICIENT_FUNDS or error on failure.
 * On real payment success: logs X402_PAYMENT and REVENUE for analytics.
 */
export async function requireX402Payment(
  actionType: PaidActionType,
  _amountWei?: string,
): Promise<RequireX402Result> {
  const ctx = getPaymentContext();

  if (ctx) {
    const { paymentTxHash, amountWei } = ctx;
    appendLog(
      createLogEvent(
        'X402_PAYMENT',
        { actionType, paymentTxHash, amountWei },
        'INFO',
      ),
    );
    appendLog(
      createLogEvent('REVENUE', { amountWei, source: 'x402' }, 'INFO'),
    );
    return { ok: true, paymentTxHash, amountWei };
  }

  if (STUB_ENABLED && process.env.X402_PAYMENT_TX_HASH) {
    return {
      ok: true,
      paymentTxHash: process.env.X402_PAYMENT_TX_HASH,
      amountWei: '0',
    };
  }

  return { ok: false, reason: 'INSUFFICIENT_FUNDS' };
}

/**
 * Verify a payment tx on Base and, if valid, run fn with that payment set in context.
 * Use from HTTP layer: verifyPaymentWithTxHash(txHash, actionType).then(() => runProposalSummarise(...)).
 */
export async function verifyPaymentWithTxHash<T>(
  txHash: string,
  actionType: PaidActionType,
  fn: () => T | Promise<T>,
): Promise<T> {
  if (!isX402RealEnabled()) {
    throw new Error('X402_OPERATOR_WALLET_BASE not set; cannot verify payment');
  }
  if (isPaymentUsed(txHash)) {
    throw new Error('PAYMENT_ALREADY_USED');
  }
  const operator = getOperatorWallet();
  const usdc = getUsdcAddress();
  const required = getRequiredAmountWei(actionType);
  const rpcUrl = getBaseRpcUrl();

  const result = await verifyPaymentOnBase(txHash, required, operator, usdc, rpcUrl);
  if (!result.ok) {
    throw new Error(result.reason);
  }

  markPaymentUsed(txHash);

  const { runWithPaymentContext } = await import('./paymentContext.js');
  return runWithPaymentContext(
    { paymentTxHash: txHash, amountWei: result.amountWei },
    fn,
  );
}
