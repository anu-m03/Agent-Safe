import { z } from 'zod';

// ─── SwarmGuard V2 Zod Schemas ──────────────────────────
// These match the V2 types used by the backend orchestrator.

export const AgentTypeSchema = z.enum([
  'SENTINEL', 'SCAM', 'MEV', 'LIQUIDATION', 'COORDINATOR', 'DEFENDER',
]);

export const SeveritySchema = z.enum(['LOW', 'MEDIUM', 'HIGH', 'CRITICAL']);

export const RecommendationSchema = z.enum(['ALLOW', 'BLOCK', 'REVIEW']);

export const ConsensusDecisionSchema = z.enum(['ALLOW', 'BLOCK', 'REVIEW_REQUIRED']);

/**
 * V2 agent risk report — produced by each SwarmGuard agent.
 * riskScore: 0-100, confidenceBps: 0-10000.
 */
export const AgentRiskReportV2Schema = z.object({
  agentId: z.string(),
  agentType: AgentTypeSchema,
  timestamp: z.number(),
  riskScore: z.number().min(0).max(100),
  confidenceBps: z.number().min(0).max(10000),
  severity: SeveritySchema,
  reasons: z.array(z.string()),
  evidence: z.record(z.unknown()),
  recommendation: RecommendationSchema.optional(),
});

/**
 * V2 consensus decision — aggregated by coordinator.
 */
export const SwarmConsensusDecisionV2Schema = z.object({
  runId: z.string(),
  timestamp: z.number(),
  finalSeverity: SeveritySchema,
  finalRiskScore: z.number().min(0).max(100),
  decision: ConsensusDecisionSchema,
  threshold: z.object({
    approvalsRequired: z.number().int().positive(),
    criticalBlockEnabled: z.boolean(),
  }),
  approvingAgents: z.array(z.object({
    agentId: z.string(),
    riskScore: z.number(),
    confidenceBps: z.number(),
    reasonHash: z.string().optional(),
  })),
  dissentingAgents: z.array(z.object({
    agentId: z.string(),
    reason: z.string().optional(),
  })),
  notes: z.array(z.string()),
});
