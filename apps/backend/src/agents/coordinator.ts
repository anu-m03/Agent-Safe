import type { AgentRiskReport, SwarmConsensusDecision } from '@agent-safe/shared';
import { CONSENSUS_THRESHOLD } from '@agent-safe/shared';

/**
 * Coordinator Agent – aggregates individual agent reports and produces consensus.
 * TODO: Implement weighted voting, configurable thresholds.
 */
export async function runCoordinatorAgent(
  reports: AgentRiskReport[],
): Promise<SwarmConsensusDecision> {
  // TODO: Implement weighted voting based on agent confidence
  // TODO: Configurable consensus threshold
  // TODO: Handle conflicting agent outputs

  const highRiskCount = reports.filter(
    (r) => r.risk_level === 'HIGH' || r.risk_level === 'CRITICAL',
  ).length;

  const riskScore = Math.round(
    (reports.reduce((sum, r) => {
      const levelScore = { LOW: 10, MEDIUM: 40, HIGH: 75, CRITICAL: 95 }[r.risk_level];
      return sum + levelScore * r.confidence;
    }, 0) /
      reports.length) *
      1,
  );

  const consensusMet = highRiskCount >= CONSENSUS_THRESHOLD;

  return {
    final_decision: consensusMet ? 'BLOCK' : 'ALLOW',
    risk_score: riskScore,
    consensus: `${highRiskCount}/${reports.length} agents`,
    summary: consensusMet
      ? 'Multiple agents flagged high risk – transaction blocked.'
      : 'Risk level acceptable – transaction allowed.',
    actions: consensusMet ? ['BLOCK_TX'] : ['ALLOW'],
    agent_reports: reports,
    timestamp: new Date().toISOString(),
  };
}
