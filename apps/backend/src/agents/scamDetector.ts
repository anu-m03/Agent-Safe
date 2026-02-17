import type { AgentRiskReportV2, Severity, Recommendation } from '@agent-safe/shared';
import type { InputTx } from '@agent-safe/shared';
import crypto from 'node:crypto';

/**
 * Scam / Contract Reputation Agent – checks contract labels and patterns.
 * Heuristics:
 *  - metadata.contractVerified == false => raise risk
 *  - metadata.contractAge < 7 days => raise risk
 *  - known phishing selector patterns
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

  // Contract verification check
  if (meta.contractVerified === false) {
    riskScore += 40;
    reasons.push('Target contract is not verified on explorer');
    evidence.contractVerified = false;
  }

  // Contract age check
  if (typeof meta.contractAge === 'number' && meta.contractAge < 7) {
    riskScore += 25;
    reasons.push(`Contract is only ${meta.contractAge} days old`);
    evidence.contractAge = meta.contractAge;
  }

  // Known phishing patterns (simplistic)
  if (typeof meta.label === 'string' && /phish|scam|hack|exploit/i.test(meta.label)) {
    riskScore += 50;
    reasons.push('Target address matches known malicious label');
    evidence.label = meta.label;
  }

  // Honeypot flag
  if (meta.isHoneypot === true) {
    riskScore += 45;
    reasons.push('Contract flagged as potential honeypot');
    evidence.isHoneypot = true;
  }

  riskScore = Math.min(riskScore, 100);
  if (riskScore >= 80) { severity = 'CRITICAL'; recommendation = 'BLOCK'; }
  else if (riskScore >= 50) { severity = 'HIGH'; recommendation = 'REVIEW'; }
  else if (riskScore >= 25) { severity = 'MEDIUM'; recommendation = 'ALLOW'; }

  if (reasons.length === 0) reasons.push('No scam indicators detected');

  return {
    agentId: `scam-${crypto.randomUUID().slice(0, 8)}`,
    agentType: 'SCAM',
    timestamp: Date.now(),
    riskScore,
    confidenceBps: riskScore > 30 ? 8000 : 5500,
    severity,
    reasons,
    evidence,
    recommendation,
  };
}
