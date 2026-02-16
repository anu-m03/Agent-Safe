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
