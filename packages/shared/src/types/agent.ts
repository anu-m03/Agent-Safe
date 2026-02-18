// ─── Agent Types ─────────────────────────────────────────

/** Names of all SwarmGuard agents */
export type AgentName =
  | 'SentinelAgent'
  | 'MEVWatcherAgent'
  | 'LiquidationPredictorAgent'
  | 'ScamDetectorAgent'
  | 'CoordinatorAgent'
  | 'DefenderAgent';

/** Risk severity levels */
export type RiskLevel = 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';

/** Final output states from the swarm */
export type SwarmDecision = 'ALLOW' | 'WARN' | 'BLOCK' | 'EXECUTE_DEFENSE';

/** Recommended actions an individual agent can suggest */
export type RecommendedAction =
  | 'ALLOW'
  | 'WARN'
  | 'BLOCK_TX'
  | 'RECOMMEND_REVOKE_APPROVAL'
  | 'EXECUTE_DEFENSE'
  | 'SUGGEST_PRIVATE_RELAY'
  | 'SUGGEST_REPAY';

/**
 * Structured risk report produced by each SwarmGuard agent.
 */
export interface AgentRiskReport {
  agent: AgentName;
  risk_level: RiskLevel;
  confidence: number; // 0.0 – 1.0
  reason: string;
  recommended_action: RecommendedAction;
  timestamp: string; // ISO-8601
}

/**
 * Aggregated consensus decision produced by the Coordinator agent.
 */
export interface SwarmConsensusDecision {
  final_decision: SwarmDecision;
  risk_score: number; // 0 – 100
  consensus: string; // e.g. "4/5 agents"
  summary: string;
  actions: RecommendedAction[];
  agent_reports: AgentRiskReport[];
  timestamp: string;
}

// ─── SwarmGuard V2 Types (deterministic orchestrator) ────

/** Agent type identifiers */
export type AgentType = 'SENTINEL' | 'SCAM' | 'MEV' | 'LIQUIDATION' | 'COORDINATOR' | 'DEFENDER';

/** Severity levels */
export type Severity = 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';

/** Recommendation enum */
export type Recommendation = 'ALLOW' | 'BLOCK' | 'REVIEW';

/** Consensus decision enum */
export type ConsensusDecision = 'ALLOW' | 'BLOCK' | 'REVIEW_REQUIRED';

/**
 * V2 structured risk report with confidence in basis points.
 */
export interface AgentRiskReportV2 {
  agentId: string;
  agentType: AgentType;
  timestamp: number; // ms
  riskScore: number; // 0-100
  confidenceBps: number; // 0-10000
  severity: Severity;
  reasons: string[];
  evidence: Record<string, unknown>;
  recommendation?: Recommendation;
}

/**
 * V2 consensus decision with full approving/dissenting breakdown.
 */
export interface SwarmConsensusDecisionV2 {
  runId: string;
  timestamp: number; // ms
  finalSeverity: Severity;
  finalRiskScore: number; // 0-100
  decision: ConsensusDecision;
  threshold: { approvalsRequired: number; criticalBlockEnabled: boolean };
  approvingAgents: {
    agentId: string;
    riskScore: number;
    confidenceBps: number;
    reasonHash?: string;
  }[];
  dissentingAgents: { agentId: string; reason?: string }[];
  notes: string[];
}
