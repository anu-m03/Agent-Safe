import type {
  AgentRiskReportV2,
  SwarmConsensusDecisionV2,
  Severity,
} from '@agent-safe/shared';
import crypto from 'node:crypto';

function shortHash(s: string): string {
  let h = 0;
  for (let i = 0; i < s.length; i++) {
    h = (Math.imul(31, h) + s.charCodeAt(i)) | 0;
  }
  return (h >>> 0).toString(16).padStart(16, '0');
}

export function computeConsensus(
  runId: string,
  reports: AgentRiskReportV2[],
): SwarmConsensusDecisionV2 {
  const timestamp = Date.now();

  if (reports.length === 0) {
    return {
      runId,
      timestamp,
      finalSeverity: 'LOW',
      finalRiskScore: 0,
      decision: 'ALLOW',
      threshold: { approvalsRequired: 2, criticalBlockEnabled: true },
      approvingAgents: [],
      dissentingAgents: [],
      notes: ['No reports provided'],
    };
  }

  // ─── Use MAX score blended with avg (same logic as coordinator) ───
  const maxScore = Math.max(...reports.map(r => r.riskScore));
  const avgScore = Math.round(
    reports.reduce((sum, r) => sum + r.riskScore, 0) / reports.length
  );
  const finalRiskScore = Math.round(maxScore * 0.7 + avgScore * 0.3);

  // ─── Inherit worst severity ────────────────────────────
  const severityRank: Record<Severity, number> = { LOW: 0, MEDIUM: 1, HIGH: 2, CRITICAL: 3 };
  const finalSeverity: Severity = reports.reduce((worst, r) =>
    severityRank[r.severity] > severityRank[worst] ? r.severity : worst,
    'LOW' as Severity
  );

  // ─── Decision based on blended score + severity ────────
  let decision: 'ALLOW' | 'REVIEW_REQUIRED' | 'BLOCK' = 'ALLOW';
  if (finalRiskScore >= 70 || finalSeverity === 'CRITICAL') decision = 'BLOCK';
  else if (finalRiskScore >= 35 || finalSeverity === 'HIGH') decision = 'REVIEW_REQUIRED';

  // ─── Split approving vs dissenting ────────────────────
  const approvingAgents = reports
    .filter(r => r.recommendation === 'ALLOW')
    .map(r => ({
      agentId: r.agentId,
      riskScore: r.riskScore,
      confidenceBps: r.confidenceBps,
      reasonHash: shortHash(r.reasons.join(';')),
    }));

  const dissentingAgents = reports
    .filter(r => r.recommendation !== 'ALLOW')
    .map(r => ({
      agentId: r.agentId,
      reason: r.reasons.join('; '),
    }));

  const notes: string[] = [
    `Approvals: ${approvingAgents.length}/${reports.length} (required 2)`,
    `Blended score: ${finalRiskScore} (max: ${maxScore}, avg: ${avgScore})`,
  ];

  return {
    runId,
    timestamp,
    finalSeverity,
    finalRiskScore,   // ← now uses blended score, not raw avg
    decision,         // ← now correctly REVIEW_REQUIRED when HIGH severity
    threshold: { approvalsRequired: 2, criticalBlockEnabled: true },
    approvingAgents,
    dissentingAgents,
    notes,
  };
}
