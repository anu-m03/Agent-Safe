/**
 * POST /api/agents/uniswap/decide — Gemini-powered swap decision.
 *
 * Flow:
 *   1. Zod-validate the request body.
 *   2. Resolve tokens via hardcoded allowlist (never from LLM).
 *   3. Fetch a Uniswap quote via the existing uniswapApi service.
 *   4. Build a read-only context object for Gemini (no secrets).
 *   5. Ask Gemini for a structured PROPOSE_SWAP or DO_NOTHING decision.
 *   6. Validate the LLM output with the AgentDecisionSchema (Zod).
 *   7. Apply deterministic guardrails that OVERRIDE Gemini:
 *      a. Tokens must be in the allowlist.
 *      b. priceImpactBps > maxPriceImpactBps → force DO_NOTHING.
 *      c. PROPOSE_SWAP without a valid quote → force DO_NOTHING.
 *   8. Return { ok, decision, quote }.
 *
 * SAFETY:
 * - Backend never signs — returns advisory data only.
 * - Token addresses are hardcoded — never from LLM.
 * - Gemini output is advisory; guardrails always win.
 */

import { Router } from 'express';
import { z } from 'zod';
import {
  getSwapQuote,
  UNISWAP_TOKENS,
  UniswapApiError,
} from '../services/uniswapApi.js';
import {
  runGeminiDecision,
  type AgentDecision,
  type DecisionContext,
} from '../services/gemini.js';
import type { UniswapQuote } from '../agents/types.js';

export const agentDecideRouter = Router();

// ─── Token Allowlist ────────────────────────────────────

const TOKEN_MAP: Record<string, string> = {
  ETH: UNISWAP_TOKENS.ETH,
  WETH: UNISWAP_TOKENS.WETH,
  USDC: UNISWAP_TOKENS.USDC,
};

const ALLOWED_SYMBOLS = Object.keys(TOKEN_MAP);

function resolveToken(input: string): string | null {
  if (input.startsWith('0x') && input.length === 42) {
    const match = Object.values(TOKEN_MAP).some(
      (addr) => addr.toLowerCase() === input.toLowerCase(),
    );
    return match ? input : null;
  }
  return TOKEN_MAP[input.toUpperCase()] ?? null;
}

function symbolOf(address: string): string | null {
  const entry = Object.entries(TOKEN_MAP).find(
    ([, addr]) => addr.toLowerCase() === address.toLowerCase(),
  );
  return entry ? entry[0] : null;
}

// ─── Request Schema ─────────────────────────────────────

const DecideRequestSchema = z.object({
  swapper: z
    .string()
    .regex(/^0x[0-9a-fA-F]{40}$/, 'swapper must be a valid 0x address'),
  goal: z.string().max(500).default('Rebalance portfolio'),
  tokenIn: z.string().default('USDC'),
  tokenOut: z.string().default('WETH'),
  amountIn: z
    .string()
    .regex(/^\d+$/, 'amountIn must be a numeric string (base units)')
    .default('1000000'), // 1 USDC (6 decimals)
  slippageBps: z.number().int().min(1).max(1000).default(50),
});

// ─── Defaults ───────────────────────────────────────────

const CHAIN_ID = 84532; // Base Sepolia
const DEFAULT_MAX_PRICE_IMPACT_BPS = 500; // 5%

// ─── Rules Fallback ─────────────────────────────────────
// Deterministic fallback when Gemini is unavailable or fails.

interface FallbackParams {
  tokenIn: string;
  tokenOut: string;
  amountIn: string;
  slippageBps: number;
}

function rulesFallbackDecision(
  params: FallbackParams,
  quote: UniswapQuote | null,
  llmErrorMsg: string,
): { decision: AgentDecision; meta: { source: string; llmError: string } } {
  const maxPI = DEFAULT_MAX_PRICE_IMPACT_BPS;
  const meta = { source: 'rules_fallback' as const, llmError: llmErrorMsg };

  // No quote → cannot evaluate safely
  if (!quote || quote.priceImpactBps == null) {
    return {
      decision: {
        action: 'DO_NOTHING',
        rationale: 'LLM unavailable and quote missing; cannot evaluate safely.',
        risks: ['LLM unavailable'],
      },
      meta,
    };
  }

  // High price impact → refuse
  if (quote.priceImpactBps > maxPI) {
    return {
      decision: {
        action: 'DO_NOTHING',
        rationale: `High price impact (${quote.priceImpactBps} bps) exceeds guardrail (${maxPI} bps).`,
        risks: ['High price impact', 'Thin liquidity'],
      },
      meta,
    };
  }

  // Quote within guardrails → propose swap for user approval
  return {
    decision: {
      action: 'PROPOSE_SWAP',
      tokenIn: params.tokenIn as 'ETH' | 'WETH' | 'USDC',
      tokenOut: params.tokenOut as 'ETH' | 'WETH' | 'USDC',
      amountIn: params.amountIn,
      slippageBps: params.slippageBps,
      rationale: 'Quote within guardrails; proposing swap for user approval.',
      risks: ['Market movement', 'Slippage'],
      guardrails: { maxPriceImpactBps: maxPI },
    },
    meta,
  };
}

// ─── POST /uniswap/decide ───────────────────────────────

agentDecideRouter.post('/uniswap/decide', async (req, res) => {
  // 1. Validate request
  const parsed = DecideRequestSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({
      ok: false,
      error: 'Invalid request body',
      details: parsed.error.flatten(),
    });
  }

  const { swapper, goal, tokenIn, tokenOut, amountIn, slippageBps } =
    parsed.data;

  // 2. Resolve tokens from allowlist
  const resolvedIn = resolveToken(tokenIn);
  const resolvedOut = resolveToken(tokenOut);

  if (!resolvedIn) {
    return res.status(400).json({
      ok: false,
      error: `Unknown or disallowed tokenIn: ${tokenIn}. Allowed: ${ALLOWED_SYMBOLS.join(', ')}`,
    });
  }
  if (!resolvedOut) {
    return res.status(400).json({
      ok: false,
      error: `Unknown or disallowed tokenOut: ${tokenOut}. Allowed: ${ALLOWED_SYMBOLS.join(', ')}`,
    });
  }

  // 3. Fetch a Uniswap quote
  let quote: UniswapQuote | null = null;
  let quoteError: string | null = null;

  try {
    quote = await getSwapQuote(
      resolvedIn,
      resolvedOut,
      amountIn,
      slippageBps,
      swapper,
    );
  } catch (err) {
    quoteError =
      err instanceof UniswapApiError
        ? err.message
        : err instanceof Error
          ? err.message
          : String(err);
    console.warn(`[agentDecide] Quote fetch failed: ${quoteError}`);
  }

  // 4. Build context for Gemini (read-only observation — no secrets)
  const context: DecisionContext = {
    chainId: CHAIN_ID,
    swapper,
    goal,
    supportedTokens: ALLOWED_SYMBOLS,
    request: {
      tokenIn: symbolOf(resolvedIn) ?? tokenIn,
      tokenOut: symbolOf(resolvedOut) ?? tokenOut,
      amountIn,
      slippageBps,
    },
    quoteObservation: quote
      ? {
          amountIn: quote.amountIn,
          amountOut: quote.amountOut,
          priceImpactBps: quote.priceImpactBps ?? null,
          route: typeof quote.route === 'string' ? quote.route : null,
        }
      : null,
  };

  // 5. Call Gemini for structured decision — fallback on ANY error
  let decision: AgentDecision;
  let meta: { source: string; llmError?: string } = { source: 'gemini' };

  try {
    decision = await runGeminiDecision(context);
  } catch (err) {
    const msg = (err instanceof Error ? err.message : String(err)).slice(0, 160);
    console.warn(`[agentDecide] Gemini failed, using rules fallback: ${msg}`);
    const fb = rulesFallbackDecision(
      { tokenIn: symbolOf(resolvedIn) ?? tokenIn, tokenOut: symbolOf(resolvedOut) ?? tokenOut, amountIn, slippageBps },
      quote,
      msg,
    );
    return res.json({
      ok: true,
      decision: fb.decision,
      quote,
      meta: fb.meta,
      ...(quoteError ? { quoteError } : {}),
    });
  }

  // 6. Deterministic guardrails — override Gemini when needed
  let overrideReason: string | null = null;

  if (decision.action === 'PROPOSE_SWAP') {
    // 6a. Token allowlist check — Gemini must not hallucinate tokens
    if (
      !ALLOWED_SYMBOLS.includes(decision.tokenIn) ||
      !ALLOWED_SYMBOLS.includes(decision.tokenOut)
    ) {
      overrideReason = `LLM proposed disallowed token(s): ${decision.tokenIn}→${decision.tokenOut}`;
    }

    // 6b. Price impact guardrail
    if (!overrideReason && quote?.priceImpactBps != null) {
      const maxImpact =
        decision.guardrails?.maxPriceImpactBps ?? DEFAULT_MAX_PRICE_IMPACT_BPS;
      if (quote.priceImpactBps > maxImpact) {
        overrideReason = `Price impact ${quote.priceImpactBps} bps exceeds max ${maxImpact} bps`;
      }
    }

    // 6c. No quote available — can't propose a swap without a quote
    if (!overrideReason && !quote) {
      overrideReason = `No valid quote available${quoteError ? `: ${quoteError}` : ''}`;
    }

    // Apply override
    if (overrideReason) {
      console.warn(`[agentDecide] Overriding PROPOSE_SWAP → DO_NOTHING: ${overrideReason}`);
      decision = {
        action: 'DO_NOTHING',
        rationale: `Guardrail override: ${overrideReason}`,
        risks: decision.risks,
      };
    }
  }

  // 7. Return decision + quote
  return res.json({
    ok: true,
    decision,
    quote,
    meta,
    ...(overrideReason ? { guardrailOverride: overrideReason } : {}),
    ...(quoteError ? { quoteError } : {}),
  });
});
