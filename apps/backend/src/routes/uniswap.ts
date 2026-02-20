/**
 * GET /api/uniswap/quote — Fetch a swap quote from Uniswap Trading API.
 *
 * SAFETY:
 * - Route contains NO business logic — delegates to uniswapApi service.
 * - Token addresses are validated and only well-known tokens accepted.
 * - Returns quote data only — never signs or submits transactions.
 */

import { Router } from 'express';
import { z } from 'zod';
import { getSwapQuote, UNISWAP_TOKENS } from '../services/uniswapApi.js';

export const uniswapRouter = Router();

// ─── Well-known token symbols to addresses ──────────────
// SAFETY: Only these tokens can be used via this endpoint.

const TOKEN_MAP: Record<string, string> = {
  ETH: UNISWAP_TOKENS.ETH,
  WETH: UNISWAP_TOKENS.WETH,
  USDC: UNISWAP_TOKENS.USDC,
};

// ─── Request Schema ─────────────────────────────────────

const QuoteRequestSchema = z.object({
  tokenIn: z.string(),
  tokenOut: z.string(),
  amountIn: z.string().regex(/^\d+$/, 'amountIn must be a decimal string (wei)'),
  slippageBps: z.number().int().min(1).max(1000).optional(),
  swapper: z.string().regex(/^0x[0-9a-fA-F]{40}$/).optional(),
});

// ─── Resolve token address ──────────────────────────────

function resolveToken(input: string): string | null {
  // If it looks like an address, use it directly (but only if it's in our allowlist)
  if (input.startsWith('0x') && input.length === 42) {
    const isAllowed = Object.values(TOKEN_MAP).some(
      (addr) => addr.toLowerCase() === input.toLowerCase(),
    );
    return isAllowed ? input : null;
  }
  // Otherwise try symbol lookup
  return TOKEN_MAP[input.toUpperCase()] ?? null;
}

// ─── GET /api/uniswap/quote ─────────────────────────────

uniswapRouter.get('/quote', async (req, res) => {
  const parsed = QuoteRequestSchema.safeParse({
    tokenIn: req.query.tokenIn,
    tokenOut: req.query.tokenOut,
    amountIn: req.query.amountIn,
    slippageBps: req.query.slippageBps ? Number(req.query.slippageBps) : undefined,
    swapper: req.query.swapper,
  });

  if (!parsed.success) {
    return res.status(400).json({
      ok: false,
      error: 'Invalid query parameters',
      details: parsed.error.flatten(),
    });
  }

  const { tokenIn, tokenOut, amountIn, slippageBps, swapper } = parsed.data;

  // Resolve token addresses
  const resolvedIn = resolveToken(tokenIn);
  const resolvedOut = resolveToken(tokenOut);

  if (!resolvedIn) {
    return res.status(400).json({
      ok: false,
      error: `Unknown or disallowed tokenIn: ${tokenIn}. Allowed: ${Object.keys(TOKEN_MAP).join(', ')}`,
    });
  }
  if (!resolvedOut) {
    return res.status(400).json({
      ok: false,
      error: `Unknown or disallowed tokenOut: ${tokenOut}. Allowed: ${Object.keys(TOKEN_MAP).join(', ')}`,
    });
  }

  try {
    const quote = await getSwapQuote(resolvedIn, resolvedOut, amountIn, slippageBps, swapper);

    return res.json({
      ok: true,
      quote,
    });
  } catch (err) {
    console.error(`[/api/uniswap/quote] Error:`, err);
    return res.status(500).json({
      ok: false,
      error: 'Quote fetch failed',
      message: err instanceof Error ? err.message : String(err),
    });
  }
});

// ─── GET /api/uniswap/tokens — List supported tokens ───

uniswapRouter.get('/tokens', (_req, res) => {
  const tokens = Object.entries(TOKEN_MAP).map(([symbol, address]) => ({
    symbol,
    address,
  }));
  res.json({ ok: true, tokens });
});
