/**
 * Verify USDC payment on Base: tx exists, succeeded, and is a transfer to operator wallet.
 * Used by x402 flow. No CDP dependency for verification — RPC only.
 */

import { createPublicClient, http, type Hash } from 'viem';
import { base } from 'viem/chains';

const TransferTopic = '0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef' as const; // Transfer(address,address,uint256)

export interface VerifyPaymentResultOk {
  ok: true;
  amountWei: string;
}

export interface VerifyPaymentResultFail {
  ok: false;
  reason: string;
}

export type VerifyPaymentResult = VerifyPaymentResultOk | VerifyPaymentResultFail;

/**
 * Verify that txHash is a successful USDC transfer to operatorWallet with amount >= requiredAmountWei.
 * amountWei: USDC smallest units (6 decimals).
 */
export async function verifyPaymentOnBase(
  txHash: string,
  requiredAmountWei: string,
  operatorWallet: string,
  usdcAddress: string,
  rpcUrl: string,
): Promise<VerifyPaymentResult> {
  const client = createPublicClient({
    chain: base,
    transport: http(rpcUrl),
  });

  const required = BigInt(requiredAmountWei);
  const operator = operatorWallet.toLowerCase() as `0x${string}`;
  const usdc = usdcAddress.toLowerCase() as `0x${string}`;

  try {
    const receipt = await client.getTransactionReceipt({ hash: txHash as Hash });
    if (!receipt || receipt.status !== 'success') {
      return { ok: false, reason: 'TX_NOT_FOUND_OR_REVERTED' };
    }

    let transferredToOperator = 0n;
    for (const log of receipt.logs) {
      if (log.address.toLowerCase() !== usdcAddress.toLowerCase()) continue;
      if (log.topics[0] !== TransferTopic || log.topics.length < 3) continue;
      const topic2 = log.topics[2];
      if (!topic2) continue;
      const to = ('0x' + topic2.slice(26)) as `0x${string}`;
      if (to.toLowerCase() !== operator) continue;
      const amount = BigInt(log.data ?? '0');
      transferredToOperator += amount;
    }

    if (transferredToOperator < required) {
      return {
        ok: false,
        reason: `UNDERPAYMENT: got ${transferredToOperator}, required ${required}`,
      };
    }

    return { ok: true, amountWei: String(transferredToOperator) };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return { ok: false, reason: `VERIFY_FAILED: ${message}` };
  }
}
