/**
 * Deterministic portfolio calculations.
 *
 * SAFETY:
 * - All concentration logic is pure arithmetic — no LLM involvement.
 * - Token addresses and balances are never sourced from LLM output.
 * - USD prices are best-effort; concentration uses raw balances when
 *   USD prices are unavailable.
 */

import type { TokenBalance, WalletPortfolio } from '../agents/types.js';

// ─── Well-known token addresses (Base Sepolia) ──────────
// SAFETY: Hardcoded — never derived from LLM output.

export const TOKENS = {
  ETH: '0x0000000000000000000000000000000000000000',
  WETH: '0x4200000000000000000000000000000000000006',
  USDC: '0x036CbD53842c5426634e7929541eC2318f3dCF7e',
} as const;

// ─── Concentration Calculation ──────────────────────────

/**
 * Compute portfolio concentration percentages.
 *
 * Uses USD values when available, otherwise falls back to
 * a simple balance-weighted approximation treating 1 ETH = $3000
 * and stablecoins at $1.
 *
 * @returns concentration map: symbol → percentage (0–100)
 */
export function computeConcentrations(
  balances: TokenBalance[],
): Record<string, number> {
  if (balances.length === 0) return {};

  // Use USD values if all tokens have them
  const allHaveUsd = balances.every((b) => b.usdValue !== undefined && b.usdValue > 0);

  if (allHaveUsd) {
    const total = balances.reduce((sum, b) => sum + (b.usdValue ?? 0), 0);
    if (total === 0) return {};

    const concentrations: Record<string, number> = {};
    for (const b of balances) {
      concentrations[b.symbol] = ((b.usdValue ?? 0) / total) * 100;
    }
    return concentrations;
  }

  // Fallback: normalise by decimals and use hardcoded price estimates
  const ETH_PRICE_USD = 3000;
  const STABLE_PRICE_USD = 1;

  let totalUsd = 0;
  const usdValues: { symbol: string; usd: number }[] = [];

  for (const b of balances) {
    const normalised = Number(BigInt(b.balanceWei)) / 10 ** b.decimals;
    const isStable = ['USDC', 'USDT', 'DAI'].includes(b.symbol.toUpperCase());
    const price = isStable ? STABLE_PRICE_USD : ETH_PRICE_USD;
    const usd = normalised * price;
    usdValues.push({ symbol: b.symbol, usd });
    totalUsd += usd;
  }

  if (totalUsd === 0) return {};

  const concentrations: Record<string, number> = {};
  for (const v of usdValues) {
    concentrations[v.symbol] = (v.usd / totalUsd) * 100;
  }
  return concentrations;
}

/**
 * Build a full WalletPortfolio from raw balances.
 */
export function buildPortfolio(
  wallet: string,
  chainId: number,
  balances: TokenBalance[],
): WalletPortfolio {
  const concentrations = computeConcentrations(balances);
  const totalUsdValue = balances.reduce((sum, b) => sum + (b.usdValue ?? 0), 0);

  return {
    wallet,
    chainId,
    balances,
    totalUsdValue,
    concentrations,
  };
}

/**
 * Calculate the swap amount as a percentage of a token balance.
 *
 * SAFETY: Pure arithmetic. Percentage is clamped to 0–100.
 *
 * @param balanceWei  Token balance in wei (string)
 * @param percentBps  Percentage in basis points (e.g. 1000 = 10%)
 * @returns Swap amount in wei (string)
 */
export function calculateSwapAmount(balanceWei: string, percentBps: number): string {
  const clampedBps = Math.max(0, Math.min(10_000, percentBps));
  const balance = BigInt(balanceWei);
  const amount = (balance * BigInt(clampedBps)) / BigInt(10_000);
  return amount.toString();
}
