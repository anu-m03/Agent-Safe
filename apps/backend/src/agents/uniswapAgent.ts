/**
 * Uniswap Agent
 *
 * Monitors portfolio concentration and proposes rebalancing swaps
 * when ETH concentration exceeds a configurable threshold.
 *
 * SAFETY:
 * - Portfolio concentration is computed deterministically.
 * - Swap amount is a fixed percentage of ETH balance (default 10%).
 * - Slippage is hardcoded (default 0.5%).
 * - Token addresses are from hardcoded constants.
 * - Gemini is used ONLY for explanation bullets and risk notes.
 * - Never signs or submits transactions.
 * - All ProposedActions expire after 5 minutes.
 */

import crypto from 'node:crypto';
import type { ProposedAction, WalletPortfolio } from './types.js';
import { computeConcentrations, calculateSwapAmount, TOKENS } from '../services/portfolio.js';
import { getSwapQuote, UNISWAP_TOKENS } from '../services/uniswapApi.js';
import { generateJSON, isGeminiConfigured } from '../llm/geminiClient.js';
import { SwapReasoningSchema } from '../llm/schemas.js';

// ─── Configuration ──────────────────────────────────────
// SAFETY: All thresholds are hardcoded constants.

/** ETH concentration threshold (%) above which a swap is proposed */
const ETH_CONCENTRATION_THRESHOLD = 60;

/** Percentage of ETH balance to swap (basis points: 1000 = 10%) */
const SWAP_PERCENT_BPS = 1000;

/** Default slippage in basis points (50 = 0.5%) */
const DEFAULT_SLIPPAGE_BPS = 50;

/** ProposedAction expires after 5 minutes */
const EXPIRY_MS = 5 * 60 * 1000;

// ─── Input ──────────────────────────────────────────────

export interface UniswapAgentInput {
  /** Wallet portfolio with current balances */
  portfolio: WalletPortfolio;
  /** Override swap percentage (basis points, default 1000 = 10%) */
  swapPercentBps?: number;
  /** Override slippage (basis points, default 50 = 0.5%) */
  slippageBps?: number;
}

// ─── Agent Logic ────────────────────────────────────────

/**
 * Run the Uniswap Agent.
 *
 * Deterministic flow:
 * 1. Compute portfolio concentrations.
 * 2. Check if ETH > threshold → if not, return null.
 * 3. Calculate swap amount (10% of ETH balance).
 * 4. Fetch Uniswap quote (ETH→USDC).
 * 5. Generate explanation via Gemini (optional).
 * 6. Return ProposedAction with actionType = "SWAP" and 5-min expiry.
 */
export async function runUniswapAgent(
  input: UniswapAgentInput,
): Promise<ProposedAction | null> {
  const { portfolio, swapPercentBps, slippageBps } = input;
  const swapBps = swapPercentBps ?? SWAP_PERCENT_BPS;
  const slippage = slippageBps ?? DEFAULT_SLIPPAGE_BPS;

  // ─── Step 1: Compute concentrations ─────────────────
  const concentrations = computeConcentrations(portfolio.balances);
  const ethConcentration = concentrations['ETH'] ?? 0;

  // ─── Step 2: Check threshold ────────────────────────
  if (ethConcentration <= ETH_CONCENTRATION_THRESHOLD) {
    return null; // Portfolio is balanced — no action needed
  }

  // ─── Step 3: Find ETH balance and calculate swap ────
  const ethBalance = portfolio.balances.find(
    (b) => b.token === TOKENS.ETH || b.symbol.toUpperCase() === 'ETH',
  );

  if (!ethBalance || ethBalance.balanceWei === '0') {
    return null; // No ETH to swap
  }

  const amountIn = calculateSwapAmount(ethBalance.balanceWei, swapBps);
  if (amountIn === '0') return null;

  // ─── Step 4: Fetch Uniswap quote ────────────────────
  const quote = await getSwapQuote(
    UNISWAP_TOKENS.WETH,
    UNISWAP_TOKENS.USDC,
    amountIn,
    slippage,
    portfolio.wallet,
  );

  // ─── Step 5: Generate explanation ───────────────────
  const { explanation, riskNotes } = await generateExplanation(
    ethConcentration,
    amountIn,
    quote.amountOut,
    slippage,
  );

  // Combine explanation + risk notes into reasoning
  const reasoning = [...explanation, ...riskNotes].slice(0, 3);

  // ─── Step 6: Return ProposedAction ──────────────────
  const now = Date.now();

  return {
    id: crypto.randomUUID(),
    agent: 'uniswap',
    title: 'Rebalance: Swap ETH → USDC',
    summary: `ETH concentration is ${ethConcentration.toFixed(1)}% (threshold: ${ETH_CONCENTRATION_THRESHOLD}%). Proposing swap of ${formatEth(amountIn)} ETH to USDC.`,
    reasoning,
    risk: ethConcentration > 80 ? 'high' : 'medium',
    actionType: 'SWAP',
    payload: {
      tokenIn: UNISWAP_TOKENS.WETH,
      tokenOut: UNISWAP_TOKENS.USDC,
      amountIn,
      amountOut: quote.amountOut,
      slippageBps: slippage,
      ethConcentrationPct: ethConcentration,
      quoteExpiresAt: quote.expiresAt,
      route: quote.route,
    },
    createdAt: now,
    expiresAt: now + EXPIRY_MS,
  };
}

// ─── Helpers ────────────────────────────────────────────

function formatEth(wei: string): string {
  const eth = Number(BigInt(wei)) / 1e18;
  return eth.toFixed(4);
}

// ─── Reasoning Generation ───────────────────────────────

const SYSTEM_PROMPT = `You are a DeFi portfolio advisor. Given portfolio data, produce a JSON object:
{ "explanation": ["<bullet 1>", ...], "riskNotes": ["<risk 1>", ...] }
explanation: 1-3 bullets explaining why this swap is recommended.
riskNotes: 0-3 bullets about potential risks of the swap.
Return ONLY the JSON object.`;

async function generateExplanation(
  ethConcentrationPct: number,
  amountInWei: string,
  amountOutRaw: string,
  slippageBps: number,
): Promise<{ explanation: string[]; riskNotes: string[] }> {
  if (!isGeminiConfigured()) {
    return getStubExplanation(ethConcentrationPct);
  }

  try {
    const userPrompt = [
      `ETH concentration: ${ethConcentrationPct.toFixed(1)}% (threshold: ${ETH_CONCENTRATION_THRESHOLD}%)`,
      `Swap: ${formatEth(amountInWei)} ETH → USDC`,
      `Expected output: ${amountOutRaw} (raw)`,
      `Slippage: ${slippageBps / 100}%`,
    ].join('\n');

    return await generateJSON(SwapReasoningSchema, SYSTEM_PROMPT, userPrompt);
  } catch (err) {
    console.warn(
      `[UniswapAgent] Gemini reasoning failed, using stubs: ${err instanceof Error ? err.message : String(err)}`,
    );
    return getStubExplanation(ethConcentrationPct);
  }
}

function getStubExplanation(ethPct: number): {
  explanation: string[];
  riskNotes: string[];
} {
  return {
    explanation: [
      `ETH concentration at ${ethPct.toFixed(1)}% exceeds ${ETH_CONCENTRATION_THRESHOLD}% threshold.`,
      'Swapping 10% of ETH holdings to USDC reduces single-asset exposure.',
      'Diversification improves resilience against ETH price volatility.',
    ],
    riskNotes: [
      'Swap execution depends on on-chain liquidity at time of signing.',
    ],
  };
}
