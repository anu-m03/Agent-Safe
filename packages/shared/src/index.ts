// ─── @agent-safe/shared barrel export ────────────────────

// Types
export type {
  AgentName,
  RiskLevel,
  SwarmDecision,
  RecommendedAction,
  AgentRiskReport,
  SwarmConsensusDecision,
  // V2
  AgentType,
  Severity,
  Recommendation,
  ConsensusDecision,
  AgentRiskReportV2,
  SwarmConsensusDecisionV2,
} from './types/agent';

export type {
  VoteDirection,
  GovernanceProposal,
  ProposalAnalysis,
  QueuedVote,
  // V2
  ProposalSummary,
  VoteRecommendation,
  VoteIntent,
} from './types/governance';

export type { PolicyConfig } from './types/policy';
export { DEFAULT_POLICY } from './types/policy';

export type {
  AgentMarker,
  DetectedZone,
  SpatialMemory,
  SpatialAtlasResponse,
} from './types/spatial';

export type {
  InputTx,
  ActionType,
  ActionIntent,
  LogEventType,
  LogLevel,
  LogEvent,
} from './types/intents';

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

// ─── Schemas (V2 — used by orchestrator) ─────────────────
export {
  AgentTypeSchema,
  SeveritySchema,
  RecommendationSchema,
  ConsensusDecisionSchema as ConsensusDecisionEnumSchema,
  AgentRiskReportV2Schema,
  SwarmConsensusDecisionV2Schema,
} from './schemas/agentV2';

export {
  VoteRecommendationSchema,
  ProposalSummarySchema,
  VoteIntentSchema,
} from './schemas/governanceV2';

export {
  ActionTypeSchema,
  InputTxSchema,
  ActionIntentSchema,
  LogEventTypeSchema,
  LogLevelSchema,
  LogEventSchema,
} from './schemas/intents';

// ─── Validators ──────────────────────────────────────────
export {
  zAddress,
  zBytes32,
  zHexData,
  zISOTimestamp,
} from './schemas/validators';

// Constants
export * from './constants';
export type { ChainConfig } from './constants/chains';
export type { SponsorEntry } from './constants/sponsors';
