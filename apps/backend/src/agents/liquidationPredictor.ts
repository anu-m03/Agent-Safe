import type { AgentRiskReportV2, Severity, Recommendation } from '@agent-safe/shared';
import type { InputTx } from '@agent-safe/shared';
import crypto from 'node:crypto';

/**
 * Liquidation Predictor Agent – tracks lending health factor.
 * Heuristics:
 *  - metadata.healthFactor < 1.2 => high risk
 *  - metadata.healthFactor < 1.05 => critical
 *  - LEND kind with borrow action
 */
export async function evaluateTx(
  _ctx: unknown,
  tx: InputTx,
): Promise<AgentRiskReportV2> {
  const reasons: string[] = [];
  const evidence: Record<string, unknown> = {};
  let riskScore = 5;
  let severity: Severity = 'LOW';
  let recommendation: Recommendation = 'ALLOW';
  const meta = tx.metadata ?? {};

  // Health factor analysis
  if (typeof meta.healthFactor === 'number') {
    evidence.healthFactor = meta.healthFactor;

    if (meta.healthFactor < 1.05) {
      riskScore += 55;
      reasons.push(`Health factor ${meta.healthFactor} — critically close to liquidation`);
      severity = 'CRITICAL';
      recommendation = 'BLOCK';
    } else if (meta.healthFactor < 1.2) {
      riskScore += 35;
      reasons.push(`Health factor ${meta.healthFactor} — at risk of liquidation`);
      severity = 'HIGH';
      recommendation = 'REVIEW';
    } else if (meta.healthFactor < 1.5) {
      riskScore += 15;
      reasons.push(`Health factor ${meta.healthFactor} — moderate risk`);
      severity = 'MEDIUM';
    }
  }

  // Lending kind check
  if (tx.kind === 'LEND') {
    riskScore += 10;
    reasons.push('Lending protocol interaction detected');
    evidence.lendingKind = true;
  }

  // Collateral ratio
  if (typeof meta.collateralRatio === 'number' && meta.collateralRatio < 150) {
    riskScore += 20;
    reasons.push(`Low collateral ratio: ${meta.collateralRatio}%`);
    evidence.collateralRatio = meta.collateralRatio;
  }

  riskScore = Math.min(riskScore, 100);
  if (riskScore >= 60 && severity === 'LOW') severity = 'HIGH';
  if (riskScore >= 80) severity = 'CRITICAL';

  if (reasons.length === 0) reasons.push('No lending risk detected');

  return {
    agentId: `liq-${crypto.randomUUID().slice(0, 8)}`,
    agentType: 'LIQUIDATION',
    timestamp: Date.now(),
    riskScore,
    confidenceBps: typeof meta.healthFactor === 'number' ? 8500 : 4000,
    severity,
    reasons,
    evidence,
    recommendation,
  };
}
