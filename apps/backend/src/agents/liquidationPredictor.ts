import type { AgentRiskReportV2, Severity, Recommendation } from '@agent-safe/shared';
import type { InputTx } from '@agent-safe/shared';
import crypto from 'node:crypto';
import { queryKiteAI } from '../services/agents/kite.js';

export async function evaluateTx(_ctx: unknown, tx: InputTx): Promise<AgentRiskReportV2> {
  const reasons: string[] = [];
  const evidence: Record<string, unknown> = {};
  let riskScore = 5;
  let severity: Severity = 'LOW';
  let recommendation: Recommendation = 'ALLOW';
  const meta = tx.metadata ?? {};

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

  if (tx.kind === 'LEND') {
    riskScore += 10;
    reasons.push('Lending protocol interaction detected');
    evidence.lendingKind = true;
  }

  if (typeof meta.collateralRatio === 'number' && meta.collateralRatio < 150) {
    riskScore += 20;
    reasons.push(`Low collateral ratio: ${meta.collateralRatio}%`);
    evidence.collateralRatio = meta.collateralRatio;
  }

  riskScore = Math.min(riskScore, 100);
  if (riskScore >= 60 && severity === 'LOW') severity = 'HIGH';
  if (riskScore >= 80) severity = 'CRITICAL';
  if (reasons.length === 0) reasons.push('No lending risk detected');

  // ─── Kite AI Enrichment ───────────────────────────────
  const aiResult = await queryKiteAI(
    'Liquidation Predictor Agent',
    `Analyze this lending position for liquidation risk:
- Protocol kind: ${tx.kind}
- Health factor: ${meta.healthFactor ?? 'unknown'}
- Collateral ratio: ${meta.collateralRatio ?? 'unknown'}%
- Heuristic score: ${riskScore}
- Heuristic reasons: ${reasons.join(', ')}`,
    { analysis: 'Heuristic fallback', riskScore, confidence: 60, reasons, recommendation },
  );

  const finalScore = Math.max(riskScore, aiResult.riskScore);
  const mergedReasons = [...new Set([...reasons, ...aiResult.reasons])];
  const finalRec = mergeRecommendation(recommendation, aiResult.recommendation);

  let finalSeverity: Severity = 'LOW';
  if (finalScore >= 80) finalSeverity = 'CRITICAL';
  else if (finalScore >= 60) finalSeverity = 'HIGH';
  else if (finalScore >= 25) finalSeverity = 'MEDIUM';

  return {
    agentId: `liq-${crypto.randomUUID().slice(0, 8)}`,
    agentType: 'LIQUIDATION',
    timestamp: Date.now(),
    riskScore: finalScore,
    confidenceBps: Math.round(aiResult.confidence * 100),
    severity: finalSeverity,
    reasons: mergedReasons,
    evidence: { ...evidence, aiAnalysis: aiResult.analysis },
    recommendation: finalRec,
  };
}

function mergeRecommendation(a: Recommendation, b: Recommendation): Recommendation {
  const rank: Record<Recommendation, number> = { ALLOW: 0, REVIEW: 1, BLOCK: 2 };
  return rank[a] >= rank[b] ? a : b;
}
