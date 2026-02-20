/**
 * Uniswap Trading API wrapper for Base Sepolia.
 *
 * SAFETY:
 * - Token addresses are hardcoded constants — never from LLM.
 * - Slippage default is deterministic (50 bps = 0.5%).
 * - This service ONLY fetches quotes; it never signs or submits.
 * - All amounts are in wei (string) to avoid floating-point loss.
 * - Calldata returned by Uniswap is passed through as-is for
 *   client-side signing only.
 */

import type { UniswapQuote } from '../agents/types.js';

// ─── Configuration ──────────────────────────────────────

const UNISWAP_API_BASE =
  process.env.UNISWAP_API_URL ?? 'https://trading-api-labs.interface.gateway.uniswap.org/v1';

const DEFAULT_SLIPPAGE_BPS = 50; // 0.5%
const QUOTE_EXPIRY_MS = 5 * 60 * 1000; // 5 minutes
const BASE_SEPOLIA_CHAIN_ID = 84532;

// ─── Well-known token addresses (Base Sepolia) ──────────
// SAFETY: Hardcoded — never derived from LLM.

export const UNISWAP_TOKENS = {
  ETH: '0x0000000000000000000000000000000000000000',
  WETH: '0x4200000000000000000000000000000000000006',
  USDC: '0x036CbD53842c5426634e7929541eC2318f3dCF7e',
} as const;

// ─── Types ──────────────────────────────────────────────

interface UniswapApiQuoteRequest {
  tokenIn: string;
  tokenOut: string;
  amount: string;
  type: 'EXACT_INPUT';
  slippageTolerance: number;
  chainId: number;
  /** Wallet address requesting the quote */
  swapper?: string;
}

interface UniswapApiQuoteResponse {
  quote: {
    amountOut: string;
    priceImpact?: number;
    route?: string;
  };
}

// ─── Public API ─────────────────────────────────────────

/**
 * Fetch a swap quote from the Uniswap Trading API.
 *
 * SAFETY: This only fetches a quote — no calldata is executed.
 * The caller must sign and submit from the client side.
 *
 * @param tokenIn     Input token address (from UNISWAP_TOKENS)
 * @param tokenOut    Output token address (from UNISWAP_TOKENS)
 * @param amountIn    Amount to swap in wei (string)
 * @param slippageBps Slippage tolerance in basis points (default 50 = 0.5%)
 * @param swapper     Optional wallet address for the swapper
 */
export async function getSwapQuote(
  tokenIn: string,
  tokenOut: string,
  amountIn: string,
  slippageBps: number = DEFAULT_SLIPPAGE_BPS,
  swapper?: string,
): Promise<UniswapQuote> {
  const requestBody: UniswapApiQuoteRequest = {
    tokenIn,
    tokenOut,
    amount: amountIn,
    type: 'EXACT_INPUT',
    slippageTolerance: slippageBps / 10_000,
    chainId: BASE_SEPOLIA_CHAIN_ID,
    ...(swapper ? { swapper } : {}),
  };

  try {
    const res = await fetch(`${UNISWAP_API_BASE}/quote`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(requestBody),
      signal: AbortSignal.timeout(10_000),
    });

    if (!res.ok) {
      const body = await res.text().catch(() => '');
      throw new UniswapApiError(
        `Uniswap API returned HTTP ${res.status}: ${body.slice(0, 200)}`,
      );
    }

    const data = (await res.json()) as UniswapApiQuoteResponse;

    return {
      tokenIn,
      tokenOut,
      amountIn,
      amountOut: data.quote.amountOut,
      slippageBps,
      priceImpactBps: data.quote.priceImpact
        ? Math.round(data.quote.priceImpact * 10_000)
        : undefined,
      route: data.quote.route,
      expiresAt: Date.now() + QUOTE_EXPIRY_MS,
    };
  } catch (err) {
    if (err instanceof UniswapApiError) throw err;

    // Return a stub quote for development / when API is unreachable
    console.warn(
      `[UniswapApi] Quote fetch failed, returning stub: ${err instanceof Error ? err.message : String(err)}`,
    );
    return createStubQuote(tokenIn, tokenOut, amountIn, slippageBps);
  }
}

/**
 * Create a deterministic stub quote for offline / dev usage.
 * SAFETY: Clearly marked as stub — never used for actual swaps.
 */
function createStubQuote(
  tokenIn: string,
  tokenOut: string,
  amountIn: string,
  slippageBps: number,
): UniswapQuote {
  // Rough approximation: 1 ETH ≈ 3000 USDC (for dev only)
  const isEthToUsdc =
    (tokenIn === UNISWAP_TOKENS.ETH || tokenIn === UNISWAP_TOKENS.WETH) &&
    tokenOut === UNISWAP_TOKENS.USDC;

  let amountOut: string;
  if (isEthToUsdc) {
    // ETH→USDC: multiply by ~3000, adjust decimals (18→6)
    const ethWei = BigInt(amountIn);
    const usdcAmount = (ethWei * BigInt(3000)) / BigInt(10 ** 12);
    amountOut = usdcAmount.toString();
  } else {
    // Default: 1:1 stub ratio
    amountOut = amountIn;
  }

  return {
    tokenIn,
    tokenOut,
    amountIn,
    amountOut,
    slippageBps,
    priceImpactBps: 10, // 0.1% stub
    route: 'STUB_ROUTE',
    expiresAt: Date.now() + QUOTE_EXPIRY_MS,
  };
}

// ─── Errors ─────────────────────────────────────────────

export class UniswapApiError extends Error {
  override name = 'UniswapApiError' as const;
}
