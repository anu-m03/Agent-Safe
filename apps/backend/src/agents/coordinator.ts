import type { AgentRiskReportV2, Severity, Recommendation } from '@agent-safe/shared';
import crypto from 'node:crypto';

/**
 * Coordinator Agent – aggregates individual agent reports and produces a summary report.
 * Does not perform independent analysis; reflects swarm consensus.
 */
export async function evaluateTx(
  _ctx: unknown,
  _tx: unknown,
  peerReports: AgentRiskReportV2[],
): Promise<AgentRiskReportV2> {
  if (peerReports.length === 0) {
    return {
      agentId: `coord-${crypto.randomUUID().slice(0, 8)}`,
      agentType: 'COORDINATOR',
      timestamp: Date.now(),
      riskScore: 0,
      confidenceBps: 0,
      severity: 'LOW',
      reasons: ['No peer reports to aggregate'],
      evidence: {},
      recommendation: 'ALLOW',
    };
  }

  // Weighted average risk score (weight = confidence)
  let totalWeight = 0;
  let weightedScore = 0;
  const severityCounts: Record<Severity, number> = { LOW: 0, MEDIUM: 0, HIGH: 0, CRITICAL: 0 };
  const reasons: string[] = [];

  for (const r of peerReports) {
    const w = r.confidenceBps / 10_000;
    weightedScore += r.riskScore * w;
    totalWeight += w;
    severityCounts[r.severity]++;
    if (r.riskScore > 30) {
      reasons.push(`${r.agentType}: score ${r.riskScore} (${r.severity})`);
    }
  }

  const avgScore = totalWeight > 0 ? Math.round(weightedScore / totalWeight) : 0;

  let severity: Severity = 'LOW';
  if (severityCounts.CRITICAL > 0) severity = 'CRITICAL';
  else if (severityCounts.HIGH > 0) severity = 'HIGH';
  else if (severityCounts.MEDIUM > 0) severity = 'MEDIUM';

  let recommendation: Recommendation = 'ALLOW';
  if (avgScore >= 70) recommendation = 'BLOCK';
  else if (avgScore >= 40) recommendation = 'REVIEW';

  if (reasons.length === 0) reasons.push('All peer agents report low risk');

  return {
    agentId: `coord-${crypto.randomUUID().slice(0, 8)}`,
    agentType: 'COORDINATOR',
    timestamp: Date.now(),
    riskScore: avgScore,
    confidenceBps: Math.round(totalWeight / peerReports.length * 10_000),
    severity,
    reasons,
    evidence: {
      peerCount: peerReports.length,
      severityCounts,
      avgScore,
    },
    recommendation,
  };
}
