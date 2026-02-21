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

import type { UniswapQuote, UniswapSwapTx } from '../agents/types.js';
import 'dotenv/config';
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
  amount: string;               // keep this
  type: 'EXACT_INPUT';
  slippageTolerance: number;
  chainId: number;              // keep this
  tokenInChainId: number;       // add this
  tokenOutChainId: number;      // add this
  swapper: string;              // make required (API requires)
}

/** Raw quote response — we keep the full object so we can pass it to /swap. */
interface UniswapApiQuoteResponse {
  quote: Record<string, unknown> & {
    amountOut?: string;
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
    if (!swapper) {
    throw new UniswapApiError('swapper is required');
    }

    const requestBody: UniswapApiQuoteRequest = {
        tokenIn,
        tokenOut,
        amount: amountIn, // keep amount
        type: 'EXACT_INPUT',
        slippageTolerance: Number((slippageBps / 100).toFixed(2)),
        chainId: BASE_SEPOLIA_CHAIN_ID,
        tokenInChainId: BASE_SEPOLIA_CHAIN_ID,
        tokenOutChainId: BASE_SEPOLIA_CHAIN_ID,
        swapper,
    };

  try {
    const apiKey = process.env.UNISWAP_API_KEY;
    if (!apiKey) throw new UniswapApiError('Missing UNISWAP_API_KEY');

    const res = await fetch(`${UNISWAP_API_BASE}/quote`, {
    method: 'POST',
    headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey, // <-- add this
    },
    body: JSON.stringify(requestBody),
    signal: AbortSignal.timeout(10_000),
    });

    if (!res.ok) {
      const body = await res.text().catch(() => '');
      throw new UniswapApiError(
        `Uniswap API returned HTTP ${res.status}: ${body.slice(0, 200)}`,
      );
    }

    const data = (await res.json()) as UniswapApiQuoteResponse & {
      amountOut?: string;
      route?: unknown[][];
    };

    // Attempt to extract amountOut from the last hop of a nested route array.
    // route is shaped: route[leg][hop] where each hop has amountOut.
    function lastHopAmountOut(route: unknown): string | undefined {
      if (!Array.isArray(route) || route.length === 0) return undefined;
      const lastLeg = route[route.length - 1];
      if (!Array.isArray(lastLeg) || lastLeg.length === 0) return undefined;
      const lastHop = lastLeg[lastLeg.length - 1] as Record<string, unknown>;
      const val = lastHop?.amountOut;
      return typeof val === 'string' && val !== '0' ? val : undefined;
    }

    // Priority: A → B → C → D → "0"
    const resolvedAmountOut: string =
      (typeof data.quote.amountOut === 'string' && data.quote.amountOut !== '0'
        ? data.quote.amountOut
        : undefined) ??
      (typeof data.amountOut === 'string' && data.amountOut !== '0'
        ? data.amountOut
        : undefined) ??
      lastHopAmountOut(data.quote.route) ??
      lastHopAmountOut(data.route) ??
      '0';

    if (process.env.DEBUG_UNISWAP === '1') {
      const lhao = lastHopAmountOut(data.quote.route) ?? lastHopAmountOut(data.route);
      console.debug('[UniswapApi] debug keys:', {
        dataKeys: Object.keys(data),
        quoteKeys: Object.keys(data.quote ?? {}),
        'data.quote.amountOut': data.quote.amountOut,
        'data.amountOut': data.amountOut,
        lastHopAmountOut: lhao,
        resolved: resolvedAmountOut,
      });
    }

    return {
      tokenIn,
      tokenOut,
      amountIn,
      amountOut: resolvedAmountOut,
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

// ─── Swap Transaction (two-step: quote → swap) ─────────

interface UniswapApiSwapResponse {
  swap: Record<string, unknown> & {
    to?: string;
    data?: string;
    value?: string;
    gasLimit?: string;
    maxFeePerGas?: string;
    maxPriorityFeePerGas?: string;
  };
}

/**
 * Fetch a signable swap transaction from the Uniswap Trading API.
 *
 * Two-step flow:
 *   1. POST /quote — get a full quote object
 *   2. POST /swap  — pass the quote back to get unsigned calldata
 *
 * SAFETY:
 * - Returns an unsigned tx payload only — backend never signs.
 * - Only allowlisted tokens are accepted (enforced by caller).
 * - Calldata is pass-through from Uniswap; we do not construct it.
 * - Deadline sanity: if swap calldata is ever built here, use validateDeadline from services/execution/guardrails.
 *
 * @param tokenIn     Input token address (from UNISWAP_TOKENS)
 * @param tokenOut    Output token address (from UNISWAP_TOKENS)
 * @param amountIn    Amount in wei / base-units (string)
 * @param slippageBps Slippage in basis points (default 50 = 0.5%)
 * @param swapper     Wallet address that will sign & send
 * @param recipient   Optional recipient (defaults to swapper)
 */
export async function getSwapTx(
  tokenIn: string,
  tokenOut: string,
  amountIn: string,
  slippageBps: number = DEFAULT_SLIPPAGE_BPS,
  swapper: string,
  recipient?: string,
): Promise<UniswapSwapTx> {
  const apiKey = process.env.UNISWAP_API_KEY;
  if (!apiKey) throw new UniswapApiError('Missing UNISWAP_API_KEY');

  const headers = {
    'Content-Type': 'application/json',
    'x-api-key': apiKey,
  };

  // ── Step 1: Fetch quote ────────────────────────────────
  const quoteBody = {
    tokenIn,
    tokenOut,
    amount: amountIn,
    type: 'EXACT_INPUT',
    slippageTolerance: Number((slippageBps / 100).toFixed(2)),
    chainId: BASE_SEPOLIA_CHAIN_ID,
    tokenInChainId: BASE_SEPOLIA_CHAIN_ID,
    tokenOutChainId: BASE_SEPOLIA_CHAIN_ID,
    swapper,
    ...(recipient ? { recipient } : {}),
  };

  const quoteRes = await fetch(`${UNISWAP_API_BASE}/quote`, {
    method: 'POST',
    headers,
    body: JSON.stringify(quoteBody),
    signal: AbortSignal.timeout(10_000),
  });

  if (!quoteRes.ok) {
    const body = await quoteRes.text().catch(() => '');
    throw new UniswapApiError(
      `Uniswap quote (for swap) returned HTTP ${quoteRes.status}: ${body.slice(0, 300)}`,
    );
  }

  const quoteData = (await quoteRes.json()) as UniswapApiQuoteResponse;

  if (!quoteData.quote) {
    throw new UniswapApiError('Uniswap quote response missing "quote" object');
  }

  // ── Step 2: Pass quote to /swap ────────────────────────
  const swapRes = await fetch(`${UNISWAP_API_BASE}/swap`, {
    method: 'POST',
    headers,
    body: JSON.stringify({ quote: quoteData.quote }),
    signal: AbortSignal.timeout(10_000),
  });

  if (!swapRes.ok) {
    const body = await swapRes.text().catch(() => '');
    throw new UniswapApiError(
      `Uniswap swap API returned HTTP ${swapRes.status}: ${body.slice(0, 300)}`,
    );
  }

  const swapData = (await swapRes.json()) as UniswapApiSwapResponse;
  const swap = swapData.swap;

  if (!swap?.to || !swap?.data) {
    throw new UniswapApiError(
      'Uniswap swap API response missing required fields (to, data)',
    );
  }

  return {
    to: swap.to,
    data: swap.data,
    value: swap.value ?? '0x0',
    chainId: BASE_SEPOLIA_CHAIN_ID,
    ...(swap.gasLimit ? { gasLimit: swap.gasLimit } : {}),
    ...(swap.maxFeePerGas ? { maxFeePerGas: swap.maxFeePerGas } : {}),
    ...(swap.maxPriorityFeePerGas ? { maxPriorityFeePerGas: swap.maxPriorityFeePerGas } : {}),
  };
}

// ─── Errors ─────────────────────────────────────────────

export class UniswapApiError extends Error {
  override name = 'UniswapApiError' as const;
}
