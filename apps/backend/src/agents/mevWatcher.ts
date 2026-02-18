import type { AgentRiskReportV2, Severity, Recommendation } from '@agent-safe/shared';
import type { InputTx } from '@agent-safe/shared';
import crypto from 'node:crypto';
import { queryKiteAI } from '../services/agents/kite.js';

const HIGH_VALUE_WEI = BigInt('500000000000000000');

export async function evaluateTx(_ctx: unknown, tx: InputTx): Promise<AgentRiskReportV2> {
  const reasons: string[] = [];
  const evidence: Record<string, unknown> = {};
  let riskScore = 5;
  let severity: Severity = 'LOW';
  let recommendation: Recommendation = 'ALLOW';

  const valueBig = BigInt(tx.value || '0');
  const isSwap = tx.kind === 'SWAP';
  const selector = tx.data?.slice(0, 10) ?? '';
  const SWAP_SELECTORS = ['0x38ed1739','0x8803dbee','0x7ff36ab5','0x18cbafe5','0x5c11d795'];
  const meta = tx.metadata ?? {};

  if (isSwap || SWAP_SELECTORS.includes(selector)) {
    riskScore += 15;
    reasons.push('Swap transaction detected — potential MEV exposure');
    evidence.isSwap = true;
    if (valueBig > HIGH_VALUE_WEI) {
      riskScore += 25;
      reasons.push(`High-value swap (${tx.value} wei) — elevated sandwich risk`);
      recommendation = 'REVIEW';
      evidence.highValue = true;
    }
  }

  if (typeof meta.slippageBps === 'number' && meta.slippageBps > 300) {
    riskScore += 15;
    reasons.push(`Slippage tolerance ${meta.slippageBps} bps exceeds safe threshold`);
    evidence.slippageBps = meta.slippageBps;
  }

  riskScore = Math.min(riskScore, 100);
  if (riskScore >= 60) { severity = 'HIGH'; recommendation = 'REVIEW'; }
  else if (riskScore >= 30) severity = 'MEDIUM';
  if (reasons.length === 0) reasons.push('No MEV risk detected');

  // ─── Kite AI Enrichment ───────────────────────────────
  const aiResult = await queryKiteAI(
    'MEV Watcher Agent',
    `Analyze this transaction for MEV/sandwich attack risk:
- Selector: ${selector}
- Value: ${tx.value} wei
- Kind: ${tx.kind}
- Slippage: ${meta.slippageBps ?? 'unknown'} bps
- Heuristic score: ${riskScore}
- Heuristic reasons: ${reasons.join(', ')}`,
    { analysis: 'Heuristic fallback', riskScore, confidence: 60, reasons, recommendation },
  );

  const finalScore = Math.max(riskScore, aiResult.riskScore);
  const mergedReasons = [...new Set([...reasons, ...aiResult.reasons])];
  const finalRec = mergeRecommendation(recommendation, aiResult.recommendation);

  let finalSeverity: Severity = 'LOW';
  if (finalScore >= 60) finalSeverity = 'HIGH';
  else if (finalScore >= 30) finalSeverity = 'MEDIUM';

  return {
    agentId: `mev-${crypto.randomUUID().slice(0, 8)}`,
    agentType: 'MEV',
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
