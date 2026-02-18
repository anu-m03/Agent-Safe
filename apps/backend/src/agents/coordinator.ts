import type { AgentRiskReportV2, Severity, Recommendation } from '@agent-safe/shared';
import crypto from 'node:crypto';

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

  // ─── Use MAX peer score, not weighted average ──────────
  // A single HIGH/CRITICAL agent should elevate the whole result
  const maxScore = Math.max(...peerReports.map(r => r.riskScore));
  const avgScore = Math.round(
    peerReports.reduce((sum, r) => sum + r.riskScore, 0) / peerReports.length
  );

  // Blend: 70% max, 30% avg — catches outliers without ignoring consensus
  const finalScore = Math.round(maxScore * 0.7 + avgScore * 0.3);

  const severityCounts: Record<Severity, number> = { LOW: 0, MEDIUM: 0, HIGH: 0, CRITICAL: 0 };
  const reasons: string[] = [];

  for (const r of peerReports) {
    severityCounts[r.severity]++;
    if (r.riskScore > 30) {
      reasons.push(`${r.agentType}: score ${r.riskScore} (${r.severity}) — ${r.reasons[0]}`);
    }
  }

  // Severity: inherit worst peer severity
  let severity: Severity = 'LOW';
  if (severityCounts.CRITICAL > 0) severity = 'CRITICAL';
  else if (severityCounts.HIGH > 0) severity = 'HIGH';
  else if (severityCounts.MEDIUM > 0) severity = 'MEDIUM';

  // Recommendation based on blended score AND worst severity
  let recommendation: Recommendation = 'ALLOW';
  if (finalScore >= 70 || severity === 'CRITICAL') recommendation = 'BLOCK';
  else if (finalScore >= 35 || severity === 'HIGH') recommendation = 'REVIEW';

  if (reasons.length === 0) reasons.push('All peer agents report low risk');

  const avgConfidence = Math.round(
    peerReports.reduce((sum, r) => sum + r.confidenceBps, 0) / peerReports.length
  );

  return {
    agentId: `coord-${crypto.randomUUID().slice(0, 8)}`,
    agentType: 'COORDINATOR',
    timestamp: Date.now(),
    riskScore: finalScore,
    confidenceBps: avgConfidence,
    severity,
    reasons,
    evidence: {
      peerCount: peerReports.length,
      severityCounts,
      maxScore,
      avgScore,
      finalScore,
    },
    recommendation,
  };
}
