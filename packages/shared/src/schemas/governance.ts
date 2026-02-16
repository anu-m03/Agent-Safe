import { z } from 'zod';

// ─── Governance Zod Schemas ─────────────────────────────

export const VoteDirectionSchema = z.enum(['FOR', 'AGAINST', 'ABSTAIN']);

export const GovernanceProposalSchema = z.object({
  id: z.string(),
  title: z.string(),
  body: z.string(),
  space: z.string(),
  author: z.string(),
  start: z.number(),
  end: z.number(),
  state: z.enum(['active', 'closed', 'pending']),
  choices: z.array(z.string()),
  snapshot: z.string(),
});

export const ProposalAnalysisSchema = z.object({
  proposalId: z.string(),
  summary: z.string(),
  riskFlags: z.array(z.string()),
  recommendation: VoteDirectionSchema,
  confidence: z.number().min(0).max(1),
  reasoning: z.string(),
  isSuspicious: z.boolean(),
  timestamp: z.string().datetime(),
});
