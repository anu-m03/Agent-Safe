import { z } from 'zod';

// ─── Agent Zod Schemas ──────────────────────────────────

export const AgentNameSchema = z.enum([
  'SentinelAgent',
  'MEVWatcherAgent',
  'LiquidationPredictorAgent',
  'ScamDetectorAgent',
  'CoordinatorAgent',
  'DefenderAgent',
]);

export const RiskLevelSchema = z.enum(['LOW', 'MEDIUM', 'HIGH', 'CRITICAL']);

export const SwarmDecisionSchema = z.enum(['ALLOW', 'WARN', 'BLOCK', 'EXECUTE_DEFENSE']);

export const RecommendedActionSchema = z.enum([
  'ALLOW',
  'WARN',
  'BLOCK_TX',
  'RECOMMEND_REVOKE_APPROVAL',
  'EXECUTE_DEFENSE',
  'SUGGEST_PRIVATE_RELAY',
  'SUGGEST_REPAY',
]);

export const AgentRiskReportSchema = z.object({
  agent: AgentNameSchema,
  risk_level: RiskLevelSchema,
  confidence: z.number().min(0).max(1),
  reason: z.string(),
  recommended_action: RecommendedActionSchema,
  timestamp: z.string().datetime(),
});

export const SwarmConsensusDecisionSchema = z.object({
  final_decision: SwarmDecisionSchema,
  risk_score: z.number().min(0).max(100),
  consensus: z.string(),
  summary: z.string(),
  actions: z.array(RecommendedActionSchema),
  agent_reports: z.array(AgentRiskReportSchema),
  timestamp: z.string().datetime(),
});
