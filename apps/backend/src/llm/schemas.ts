/**
 * Zod schemas for validating LLM (Gemini) JSON outputs.
 *
 * SAFETY: Every LLM response is validated against these schemas
 * before being used in any agent logic. Invalid responses trigger
 * a single retry, then throw a descriptive error.
 */

import { z } from 'zod';

// ─── Security Hygiene Agent LLM Output ──────────────────

export const SecurityReasoningSchema = z.object({
  reasoning: z
    .array(z.string().max(200))
    .min(1)
    .max(3),
});

export type SecurityReasoningParsed = z.infer<typeof SecurityReasoningSchema>;

// ─── Uniswap Agent LLM Output ──────────────────────────

export const SwapReasoningSchema = z.object({
  explanation: z
    .array(z.string().max(200))
    .min(1)
    .max(3),
  riskNotes: z
    .array(z.string().max(200))
    .min(0)
    .max(3),
});

export type SwapReasoningParsed = z.infer<typeof SwapReasoningSchema>;

// ─── Governance Agent LLM Output ────────────────────────

export const GovernanceSummarySchema = z.object({
  summary: z.string().max(500),
  risks: z
    .array(z.string().max(200))
    .min(0)
    .max(5),
  recommendation: z.enum(['FOR', 'AGAINST', 'ABSTAIN']),
  confidence: z.number().min(0).max(1),
});

export type GovernanceSummaryParsed = z.infer<typeof GovernanceSummarySchema>;
