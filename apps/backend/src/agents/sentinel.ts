import type { AgentRiskReportV2, Severity, Recommendation } from '@agent-safe/shared';
import type { InputTx } from '@agent-safe/shared';
import crypto from 'node:crypto';
import { queryKiteAI } from '../services/agents/kite.js';

/**
 * Sentinel Agent – monitors wallet activity and new approvals.
 * Heuristics:
 *  - to is zero address => suspicious
 *  - data empty with high value => suspicious
 *  - approve() / setApprovalForAll() selectors => elevated risk
 *  - unlimited approval (MAX_UINT) => CRITICAL
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

  // Zero-address check
  if (tx.to === '0x0000000000000000000000000000000000000000' || tx.to === '0x0') {
    riskScore += 40;
    reasons.push('Transaction targets zero address');
    evidence.zeroAddress = true;
  }

  // Empty data with high value
  const valueBig = BigInt(tx.value || '0');
  if ((!tx.data || tx.data === '0x') && valueBig > BigInt('1000000000000000000')) {
    riskScore += 25;
    reasons.push('Plain ETH transfer with high value and no calldata');
    evidence.highValueNoData = true;
  }

  // Approval detection via 4-byte selector
  const selector = tx.data?.slice(0, 10) ?? '';
  const APPROVE_SELECTOR = '0x095ea7b3'; // approve(address,uint256)
  const SET_APPROVAL_ALL = '0xa22cb465'; // setApprovalForAll(address,bool)

  if (selector === APPROVE_SELECTOR) {
    riskScore += 25;
    reasons.push('ERC-20 approve() detected');
    evidence.isApproval = true;

    // Check for unlimited (MAX_UINT)
    const amountHex = tx.data.slice(74, 138); // 2nd param
    if (amountHex && /^f{64}$/i.test(amountHex)) {
      riskScore += 30;
      reasons.push('Unlimited approval (MAX_UINT256)');
      evidence.unlimitedApproval = true;
    }
  }

  if (selector === SET_APPROVAL_ALL) {
    riskScore += 35;
    reasons.push('setApprovalForAll() detected — grants full NFT access');
    evidence.setApprovalForAll = true;
  }

  // Clamp and classify
  riskScore = Math.min(riskScore, 100);
  if (riskScore >= 80) { severity = 'CRITICAL'; recommendation = 'BLOCK'; }
  else if (riskScore >= 50) { severity = 'HIGH'; recommendation = 'REVIEW'; }
  else if (riskScore >= 25) { severity = 'MEDIUM'; recommendation = 'ALLOW'; }

  if (reasons.length === 0) reasons.push('No suspicious patterns detected');

  // ─── Kite AI Enrichment ───────────────────────────────
  const aiResult = await queryKiteAI(
    'Sentinel Security Agent',
    `Analyze this transaction for approval risks and suspicious patterns:
- To: ${tx.to}
- Value: ${tx.value} wei
- Selector: ${selector}
- Kind: ${tx.kind}
- Heuristic risk score: ${riskScore}
- Heuristic reasons: ${reasons.join(', ')}
- Metadata: ${JSON.stringify(tx.metadata ?? {})}`,
    {
      analysis: 'Heuristic fallback',
      riskScore,
      confidence: 60,
      reasons,
      recommendation,
    },
  );

  // Merge AI result — take the higher risk score
  const finalScore = Math.max(riskScore, aiResult.riskScore);
  const mergedReasons = [...new Set([...reasons, ...aiResult.reasons])];
  const finalRec = mergeRecommendation(recommendation, aiResult.recommendation);

  let finalSeverity: Severity = 'LOW';
  if (finalScore >= 80) finalSeverity = 'CRITICAL';
  else if (finalScore >= 50) finalSeverity = 'HIGH';
  else if (finalScore >= 25) finalSeverity = 'MEDIUM';

  return {
    agentId: `sentinel-${crypto.randomUUID().slice(0, 8)}`,
    agentType: 'SENTINEL',
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
