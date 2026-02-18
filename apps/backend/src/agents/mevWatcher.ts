import type { AgentRiskReportV2, Severity, Recommendation } from '@agent-safe/shared';
import type { InputTx } from '@agent-safe/shared';
import crypto from 'node:crypto';

const HIGH_VALUE_WEI = BigInt('500000000000000000'); // 0.5 ETH

/**
 * MEV Watcher Agent – detects sandwich-risk swaps.
 * Heuristics:
 *  - SWAP kind with high value => medium risk, recommend private relay
 *  - known DEX router selectors
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

  const valueBig = BigInt(tx.value || '0');
  const isSwap = tx.kind === 'SWAP';
  const selector = tx.data?.slice(0, 10) ?? '';

  // Common DEX swap selectors
  const SWAP_SELECTORS = [
    '0x38ed1739', // swapExactTokensForTokens
    '0x8803dbee', // swapTokensForExactTokens
    '0x7ff36ab5', // swapExactETHForTokens
    '0x18cbafe5', // swapExactTokensForETH
    '0x5c11d795', // swapExactTokensForTokensSupportingFeeOnTransferTokens
  ];

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

  // Slippage heuristic from metadata
  const meta = tx.metadata ?? {};
  if (typeof meta.slippageBps === 'number' && meta.slippageBps > 300) {
    riskScore += 15;
    reasons.push(`Slippage tolerance ${meta.slippageBps} bps exceeds safe threshold`);
    evidence.slippageBps = meta.slippageBps;
  }

  riskScore = Math.min(riskScore, 100);
  if (riskScore >= 60) { severity = 'HIGH'; recommendation = 'REVIEW'; }
  else if (riskScore >= 30) { severity = 'MEDIUM'; }

  if (reasons.length === 0) reasons.push('No MEV risk detected');

  return {
    agentId: `mev-${crypto.randomUUID().slice(0, 8)}`,
    agentType: 'MEV',
    timestamp: Date.now(),
    riskScore,
    confidenceBps: isSwap ? 7500 : 5000,
    severity,
    reasons,
    evidence,
    recommendation,
  };
}
