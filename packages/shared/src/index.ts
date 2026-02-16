// ─── @agent-safe/shared barrel export ────────────────────

// Types
export type {
  AgentName,
  RiskLevel,
  SwarmDecision,
  RecommendedAction,
  AgentRiskReport,
  SwarmConsensusDecision,
} from './types/agent';

export type {
  VoteDirection,
  GovernanceProposal,
  ProposalAnalysis,
  QueuedVote,
} from './types/governance';

export type { PolicyConfig } from './types/policy';
export { DEFAULT_POLICY } from './types/policy';

export type {
  SupportedChainId,
  TransactionEvaluation,
  SimulationResult,
  TokenTransfer,
  ApprovalChange,
  PolicyCheckResult,
  AuditLogEntry,
} from './types/wallet';

// Schemas
export {
  AgentNameSchema,
  RiskLevelSchema,
  SwarmDecisionSchema,
  RecommendedActionSchema,
  AgentRiskReportSchema,
  SwarmConsensusDecisionSchema,
} from './schemas/agent';

export {
  VoteDirectionSchema,
  GovernanceProposalSchema,
  ProposalAnalysisSchema,
} from './schemas/governance';

export { PolicyConfigSchema } from './schemas/policy';

// Constants
export * from './constants';
