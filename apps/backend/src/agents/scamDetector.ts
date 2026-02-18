import type { AgentRiskReportV2, Severity, Recommendation } from '@agent-safe/shared';
import type { InputTx } from '@agent-safe/shared';
import crypto from 'node:crypto';
import { queryKiteAI } from '../services/agents/kite.js';
import { getContractInfo } from '../services/rpc/kitescan.js';

export async function evaluateTx(_ctx: unknown, tx: InputTx): Promise<AgentRiskReportV2> {
  const reasons: string[] = [];
  const evidence: Record<string, unknown> = {};
  let riskScore = 5;
  let severity: Severity = 'LOW';
  let recommendation: Recommendation = 'ALLOW';
  const meta = tx.metadata ?? {};

  // ─── Kitescan Live Lookup ─────────────────────────────
  // Fetch real contract info; fall back to metadata if unavailable
  const contractInfo = await getContractInfo(tx.to ?? '');
  evidence.contractInfoSource = contractInfo.source;

  const isVerified = contractInfo.source === 'kitescan'
    ? contractInfo.isVerified
    : (meta.contractVerified as boolean | undefined) ?? null;

  const ageInDays = contractInfo.source === 'kitescan'
    ? contractInfo.ageInDays
    : (meta.contractAge as number | undefined) ?? null;

  evidence.isVerified = isVerified;
  evidence.ageInDays = ageInDays;

  // ─── Heuristics (now using live data) ────────────────
  if (isVerified === false) {
    riskScore += 40;
    reasons.push('Target contract is not verified on Kitescan explorer');
    evidence.contractVerified = false;
  }
  if (typeof ageInDays === 'number' && ageInDays < 7) {
    riskScore += 25;
    reasons.push(`Contract is only ${ageInDays} days old`);
    evidence.contractAge = ageInDays;
  }
  if (typeof meta.label === 'string' && /phish|scam|hack|exploit/i.test(meta.label)) {
    riskScore += 50;
    reasons.push('Target address matches known malicious label');
    evidence.label = meta.label;
  }
  if (meta.isHoneypot === true) {
    riskScore += 45;
    reasons.push('Contract flagged as potential honeypot');
    evidence.isHoneypot = true;
  }

  riskScore = Math.min(riskScore, 100);
  if (riskScore >= 80) { severity = 'CRITICAL'; recommendation = 'BLOCK'; }
  else if (riskScore >= 50) { severity = 'HIGH'; recommendation = 'REVIEW'; }
  else if (riskScore >= 25) { severity = 'MEDIUM'; }
  if (reasons.length === 0) reasons.push('No scam indicators detected');

  // ─── Kite AI Enrichment ───────────────────────────────
  const aiResult = await queryKiteAI(
    'Scam Detector Agent',
    `Analyze this contract interaction for scam/phishing risk:
- Contract address: ${tx.to}
- Verified on Kitescan: ${isVerified ?? 'unknown'}
- Contract age: ${ageInDays ?? 'unknown'} days
- Data source: ${contractInfo.source}
- Label: ${meta.label ?? 'none'}
- Honeypot flag: ${meta.isHoneypot ?? false}
- Heuristic score: ${riskScore}
- Heuristic reasons: ${reasons.join(', ')}`,
    { analysis: 'Heuristic fallback', riskScore, confidence: 60, reasons, recommendation },
  );

  const finalScore = Math.max(riskScore, aiResult.riskScore);
  const mergedReasons = [...new Set([...reasons, ...aiResult.reasons])];
  const finalRec = mergeRecommendation(recommendation, aiResult.recommendation);

  let finalSeverity: Severity = 'LOW';
  if (finalScore >= 80) finalSeverity = 'CRITICAL';
  else if (finalScore >= 50) finalSeverity = 'HIGH';
  else if (finalScore >= 25) finalSeverity = 'MEDIUM';

  return {
    agentId: `scam-${crypto.randomUUID().slice(0, 8)}`,
    agentType: 'SCAM',
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
