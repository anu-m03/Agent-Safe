import type {
  AgentRiskReportV2,
  SwarmConsensusDecisionV2,
  Severity,
  ConsensusDecision,
} from '@agent-safe/shared';
import crypto from 'node:crypto';

const APPROVALS_REQUIRED = 2;
const CRITICAL_BLOCK_ENABLED = true;

/**
 * Compute swarm consensus from individual agent reports.
 *
 * Rules (MVP):
 *  1. If any report is CRITICAL with confidence >= 7000 bps => BLOCK.
 *  2. Count "approvals" = reports where recommendation is ALLOW
 *     OR severity is LOW/MEDIUM with confidence >= 6000 bps.
 *  3. If approvals >= APPROVALS_REQUIRED => ALLOW.
 *  4. Otherwise => REVIEW_REQUIRED.
 */
export function computeConsensus(
  runId: string,
  reports: AgentRiskReportV2[],
): SwarmConsensusDecisionV2 {
  const notes: string[] = [];
  const approvingAgents: SwarmConsensusDecisionV2['approvingAgents'] = [];
  const dissentingAgents: SwarmConsensusDecisionV2['dissentingAgents'] = [];

  // Rule 1: Critical block
  if (CRITICAL_BLOCK_ENABLED) {
    const criticals = reports.filter(
      (r) => r.severity === 'CRITICAL' && r.confidenceBps >= 7000,
    );
    if (criticals.length > 0) {
      for (const c of criticals) {
        dissentingAgents.push({
          agentId: c.agentId,
          reason: c.reasons.join('; '),
        });
      }
      notes.push(
        `Blocked: ${criticals.length} agent(s) reported CRITICAL with high confidence`,
      );
      return buildResult(runId, reports, 'BLOCK', approvingAgents, dissentingAgents, notes);
    }
  }

  // Rule 2-3: count approvals
  for (const r of reports) {
    const isExplicitAllow = r.recommendation === 'ALLOW';
    const isLowRiskConfident =
      (r.severity === 'LOW' || r.severity === 'MEDIUM') &&
      r.confidenceBps >= 6000;

    if (isExplicitAllow || isLowRiskConfident) {
      approvingAgents.push({
        agentId: r.agentId,
        riskScore: r.riskScore,
        confidenceBps: r.confidenceBps,
        reasonHash: hashReasons(r.reasons),
      });
    } else {
      dissentingAgents.push({
        agentId: r.agentId,
        reason: r.reasons.join('; '),
      });
    }
  }

  const decision: ConsensusDecision =
    approvingAgents.length >= APPROVALS_REQUIRED ? 'ALLOW' : 'REVIEW_REQUIRED';

  notes.push(
    `Approvals: ${approvingAgents.length}/${reports.length} (required ${APPROVALS_REQUIRED})`,
  );

  return buildResult(runId, reports, decision, approvingAgents, dissentingAgents, notes);
}

/* ── helpers ────────────────────────────────────────────── */

function buildResult(
  runId: string,
  reports: AgentRiskReportV2[],
  decision: ConsensusDecision,
  approvingAgents: SwarmConsensusDecisionV2['approvingAgents'],
  dissentingAgents: SwarmConsensusDecisionV2['dissentingAgents'],
  notes: string[],
): SwarmConsensusDecisionV2 {
  const scores = reports.map((r) => r.riskScore);
  const avgScore = Math.round(scores.reduce((a, b) => a + b, 0) / (scores.length || 1));

  const highestSeverity: Severity =
    reports.some((r) => r.severity === 'CRITICAL') ? 'CRITICAL'
    : reports.some((r) => r.severity === 'HIGH') ? 'HIGH'
    : reports.some((r) => r.severity === 'MEDIUM') ? 'MEDIUM'
    : 'LOW';

  return {
    runId,
    timestamp: Date.now(),
    finalSeverity: highestSeverity,
    finalRiskScore: avgScore,
    decision,
    threshold: {
      approvalsRequired: APPROVALS_REQUIRED,
      criticalBlockEnabled: CRITICAL_BLOCK_ENABLED,
    },
    approvingAgents,
    dissentingAgents,
    notes,
  };
}

function hashReasons(reasons: string[]): string {
  return crypto
    .createHash('sha256')
    .update(reasons.join('|'))
    .digest('hex')
    .slice(0, 16);
}
