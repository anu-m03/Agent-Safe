/**
 * Uniswap Trading API wrapper for Base.
 *
 * SAFETY:
 * - Production default is Base mainnet (8453).
 * - Testnet fallback is explicit-only: AGENT_TESTNET_MODE=true.
 * - Chain override is explicit-only: UNISWAP_CHAIN_ID=8453|84532.
 * - Token addresses are hardcoded constants — never from LLM.
 * - Slippage default is deterministic (50 bps = 0.5%).
 * - This service ONLY fetches quotes; it never signs or submits.
 * - All amounts are in wei (string) to avoid floating-point loss.
 * - Calldata returned by Uniswap is passed through as-is.
 * - No silent production stubs: quote failures are explicit by default.
 */

import type { UniswapQuote, UniswapSwapTx } from '../agents/types.js';
import 'dotenv/config';
// ─── Configuration ──────────────────────────────────────

const UNISWAP_API_BASE =
  process.env.UNISWAP_API_URL ?? 'https://trading-api.gateway.uniswap.org/v1';

const DEFAULT_SLIPPAGE_BPS = 50; // 0.5%
const QUOTE_EXPIRY_MS = 5 * 60 * 1000; // 5 minutes
const BASE_MAINNET_CHAIN_ID = 8453;
const BASE_SEPOLIA_CHAIN_ID = 84532;
type SupportedUniswapChainId = typeof BASE_MAINNET_CHAIN_ID | typeof BASE_SEPOLIA_CHAIN_ID;

// ─── Production / Testnet mode ─────────────────────────
// Default is production (Base mainnet).
// Overrides are explicit for controlled testing only.
function resolveUniswapChainId(): SupportedUniswapChainId {
  const override = process.env.UNISWAP_CHAIN_ID?.trim();
  if (override) {
    if (override === String(BASE_MAINNET_CHAIN_ID)) return BASE_MAINNET_CHAIN_ID;
    if (override === String(BASE_SEPOLIA_CHAIN_ID)) return BASE_SEPOLIA_CHAIN_ID;
    throw new Error(
      `Invalid UNISWAP_CHAIN_ID="${override}". Allowed values: ${BASE_MAINNET_CHAIN_ID}, ${BASE_SEPOLIA_CHAIN_ID}`,
    );
  }

  // Backward-compatible explicit switch for testnet.
  if (process.env.AGENT_TESTNET_MODE === 'true') return BASE_SEPOLIA_CHAIN_ID;
  return BASE_MAINNET_CHAIN_ID;
}

export const UNISWAP_CHAIN_ID: SupportedUniswapChainId = resolveUniswapChainId();

// ─── Well-known token addresses ─────────────────────────
// SAFETY: Hardcoded — never derived from LLM.
//
// Source of truth:
// - WETH on Base (mainnet + sepolia): canonical predeploy 0x4200...0006.
// - USDC on Base mainnet: Circle canonical token contract.
// - USDC on Base Sepolia: canonical testnet token used for dev/test.
// Update only via manual review.

const BASE_MAINNET_TOKENS = {
  ETH: '0x0000000000000000000000000000000000000000',
  WETH: '0x4200000000000000000000000000000000000006',
  USDC: '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913',
} as const;

const BASE_SEPOLIA_TOKENS = {
  ETH: '0x0000000000000000000000000000000000000000',
  WETH: '0x4200000000000000000000000000000000000006',
  USDC: '0x036CbD53842c5426634e7929541eC2318f3dCF7e',
} as const;

type UniswapTokenMap = {
  readonly ETH: `0x${string}`;
  readonly WETH: `0x${string}`;
  readonly USDC: `0x${string}`;
};

const TOKENS_BY_CHAIN: Record<SupportedUniswapChainId, UniswapTokenMap> = {
  [BASE_MAINNET_CHAIN_ID]: BASE_MAINNET_TOKENS,
  [BASE_SEPOLIA_CHAIN_ID]: BASE_SEPOLIA_TOKENS,
};

export const UNISWAP_TOKENS = TOKENS_BY_CHAIN[UNISWAP_CHAIN_ID];

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
    amount: amountIn,
    type: 'EXACT_INPUT',
    slippageTolerance: Number((slippageBps / 100).toFixed(2)),
    chainId: UNISWAP_CHAIN_ID,
    tokenInChainId: UNISWAP_CHAIN_ID,
    tokenOutChainId: UNISWAP_CHAIN_ID,
    swapper,
  };

  try {
    const apiKey = process.env.UNISWAP_API_KEY;
    if (!apiKey) throw new UniswapApiError('Missing UNISWAP_API_KEY');

    const res = await fetch(`${UNISWAP_API_BASE}/quote`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
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
    const message = err instanceof Error ? err.message : String(err);
    console.error(
      `[UniswapApi] Quote fetch failed (chainId=${UNISWAP_CHAIN_ID}, url=${UNISWAP_API_BASE}): ${message}`,
    );

    // Explicit-only test override. Never enabled on production chainId 8453.
    if (
      UNISWAP_CHAIN_ID !== BASE_MAINNET_CHAIN_ID &&
      process.env.UNISWAP_ALLOW_DEV_STUB_QUOTE === 'true'
    ) {
      console.warn('[UniswapApi] Using explicit dev stub quote override.');
      return createStubQuote(tokenIn, tokenOut, amountIn, slippageBps);
    }

    if (err instanceof UniswapApiError) throw err;
    throw new UniswapApiError(`Quote fetch failed: ${message}`);
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
  try {
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
      chainId: UNISWAP_CHAIN_ID,
      tokenInChainId: UNISWAP_CHAIN_ID,
      tokenOutChainId: UNISWAP_CHAIN_ID,
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
      chainId: UNISWAP_CHAIN_ID,
      ...(swap.gasLimit ? { gasLimit: swap.gasLimit } : {}),
      ...(swap.maxFeePerGas ? { maxFeePerGas: swap.maxFeePerGas } : {}),
      ...(swap.maxPriorityFeePerGas ? { maxPriorityFeePerGas: swap.maxPriorityFeePerGas } : {}),
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error(
      `[UniswapApi] Swap tx fetch failed (chainId=${UNISWAP_CHAIN_ID}, url=${UNISWAP_API_BASE}): ${message}`,
    );
    if (err instanceof UniswapApiError) throw err;
    throw new UniswapApiError(`Swap tx fetch failed: ${message}`);
  }
}

// ─── Errors ─────────────────────────────────────────────

export class UniswapApiError extends Error {
  override name = 'UniswapApiError' as const;
}
