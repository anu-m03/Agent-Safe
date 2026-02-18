import { z } from 'zod';

// ─── Governance V2 Zod Schemas ──────────────────────────

export const VoteRecommendationSchema = z.enum(['FOR', 'AGAINST', 'ABSTAIN', 'NO_ACTION']);

export const ProposalSummarySchema = z.object({
  id: z.string(),
  title: z.string(),
  body: z.string(),
  space: z.string(),
  start: z.number(),
  end: z.number(),
  choices: z.array(z.string()),
  snapshot: z.string().optional(),
  url: z.string().optional(),
  source: z.enum(['snapshot', 'nouns']).optional(),
  state: z.string().optional(),
  author: z.string().optional(),
  votes: z.number().optional(),
  scoresTotal: z.number().optional(),
  quorum: z.number().optional(),
});

export const VoteIntentSchema = z.object({
  intentId: z.string(),
  proposalId: z.string(),
  space: z.string(),
  createdAt: z.number(),
  recommendation: VoteRecommendationSchema,
  confidenceBps: z.number().min(0).max(10000),
  reasons: z.array(z.string()),
  policyChecks: z.record(z.unknown()),
  meta: z.record(z.unknown()),
});
