/**
 * Gemini Agent Decision Service
 *
 * Thin wrapper around the core Gemini client, specialised for
 * the Uniswap co-pilot "decide" flow.
 *
 * SAFETY:
 * - Gemini only receives observation data (quote, tokens, goal).
 * - It NEVER receives private keys, calldata, or gas params.
 * - Its output is validated with Zod and overridden by hard
 *   guardrails in the route handler — Gemini is advisory only.
 * - responseMimeType: 'application/json' forces JSON output.
 */

import { generateJSON, isGeminiConfigured, GeminiUnavailableError } from '../llm/geminiClient.js';
import { z } from 'zod';

// ─── Decision Schemas ───────────────────────────────────

const ALLOWED_TOKENS = ['ETH', 'WETH', 'USDC'] as const;

export const ProposeSwapSchema = z.object({
  action: z.literal('PROPOSE_SWAP'),
  tokenIn: z.enum(ALLOWED_TOKENS),
  tokenOut: z.enum(ALLOWED_TOKENS),
  amountIn: z.string().regex(/^\d+$/, 'amountIn must be numeric'),
  slippageBps: z.number().int().min(1).max(1000),
  rationale: z.string().max(500),
  risks: z.array(z.string().max(200)).max(5),
  guardrails: z.object({
    maxPriceImpactBps: z.number().int().min(1).max(10000).optional(),
  }),
});

export const DoNothingSchema = z.object({
  action: z.literal('DO_NOTHING'),
  rationale: z.string().max(500),
  risks: z.array(z.string().max(200)).max(5),
});

export const AgentDecisionSchema = z.discriminatedUnion('action', [
  ProposeSwapSchema,
  DoNothingSchema,
]);

export type AgentDecision = z.infer<typeof AgentDecisionSchema>;
export type ProposeSwap = z.infer<typeof ProposeSwapSchema>;
export type DoNothing = z.infer<typeof DoNothingSchema>;

// ─── Prompt ─────────────────────────────────────────────

const SYSTEM_PROMPT = `You are a DeFi co-pilot agent for a wallet on Base Sepolia.
You MUST return ONLY valid JSON matching one of these two schemas — no markdown, no code fences, no prose.

Schema A — PROPOSE_SWAP:
{
  "action": "PROPOSE_SWAP",
  "tokenIn": "USDC" | "WETH" | "ETH",
  "tokenOut": "USDC" | "WETH" | "ETH",
  "amountIn": "<numeric decimal string in base units / wei>",
  "slippageBps": <integer 1-1000>,
  "rationale": "<one sentence>",
  "risks": ["<risk 1>", ...],
  "guardrails": { "maxPriceImpactBps": <integer, default 500> }
}

Schema B — DO_NOTHING:
{
  "action": "DO_NOTHING",
  "rationale": "<one sentence>",
  "risks": ["<risk 1>", ...]
}

Rules:
- Only use tokens: ETH, WETH, USDC.
- amountIn must be a numeric string (no decimals, base units).
- slippageBps must be 1–1000.
- If the quote shows high price impact or low liquidity, prefer DO_NOTHING.
- Be conservative. When in doubt, DO_NOTHING.
- Return ONLY the JSON object. No other text.`;

// ─── Public API ─────────────────────────────────────────

export interface DecisionContext {
  chainId: number;
  swapper: string;
  goal: string;
  supportedTokens: readonly string[];
  request: {
    tokenIn: string;
    tokenOut: string;
    amountIn: string;
    slippageBps: number;
  };
  quoteObservation: {
    amountIn: string;
    amountOut: string;
    priceImpactBps: number | null;
    route: string | null;
  } | null;
}

/**
 * Ask Gemini for a structured swap decision.
 *
 * @param context  Observation data (quote, goal, tokens)
 * @returns Validated AgentDecision (PROPOSE_SWAP or DO_NOTHING)
 * @throws GeminiUnavailableError if GEMINI_API_KEY is not set
 */
export async function runGeminiDecision(
  context: DecisionContext,
): Promise<AgentDecision> {
  if (!isGeminiConfigured()) {
    throw new GeminiUnavailableError('GEMINI_API_KEY is not set');
  }

  const userPrompt = `Context:\n${JSON.stringify(context, null, 2)}`;

  return generateJSON(AgentDecisionSchema, SYSTEM_PROMPT, userPrompt);
}
