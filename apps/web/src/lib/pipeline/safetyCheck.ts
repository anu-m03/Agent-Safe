/**
 * Safety pipeline: scam patterns, dangerous permissions, private keys,
 * malicious transfer logic, rug-pull indicators.
 * Returns SAFE | REVIEW | BLOCK with risk score and reasons.
 */

import type { GeneratedDapp, SafetyReport, SafetyVerdict } from './types';

const PATTERNS = {
  privateKey: /(?:private\s+key|privkey|secret\s*=\s*["']0x[a-fA-F0-9]{64}|\.env.*KEY|mnemonic|seed\s+phrase)/i,
  hardcodedAddress: /0x[a-fA-F0-9]{40}\s*;\s*\/\/(?:owner|admin|treasury|dev)/i,
  unlimitedApproval: /approve\s*\(\s*spender\s*,\s*type\s*\(\s*uint256\s*\)\.\s*max|approve\s*\([^,]+,\s*-1\s*\)/i,
  uncheckedTransfer: /\.transfer\s*\(|\.call\s*\{[^}]*value\s*:/i,
  selfDestruct: /selfdestruct\s*\(|suicide\s*\(/i,
  delegatecall: /\.delegatecall\s*\(/i,
  reentrancyRisky: /\.call\.value\s*\(|\.transfer\s*\([^)]+\)\s*;/i,
  mintToArbitrary: /_mint\s*\(\s*[^,]+\s*,\s*[^)]+\s*\)|mint\s*\(\s*to\s*,\s*amount/i,
};

function scoreSnippet(snippet: string): { score: number; reasons: string[] } {
  let score = 0;
  const reasons: string[] = [];

  if (PATTERNS.privateKey.test(snippet)) {
    score += 100;
    reasons.push('Possible private key or secret in code');
  }
  if (PATTERNS.selfDestruct.test(snippet)) {
    score += 90;
    reasons.push('selfdestruct/suicide detected');
  }
  if (PATTERNS.delegatecall.test(snippet)) {
    score += 40;
    reasons.push('delegatecall usage (needs review)');
  }
  if (PATTERNS.unlimitedApproval.test(snippet)) {
    score += 35;
    reasons.push('Unlimited approval pattern');
  }
  if (PATTERNS.mintToArbitrary.test(snippet)) {
    score += 25;
    reasons.push('Mint to arbitrary address (ensure access control)');
  }
  if (PATTERNS.hardcodedAddress.test(snippet)) {
    score += 20;
    reasons.push('Hardcoded owner/admin address');
  }
  if (PATTERNS.uncheckedTransfer.test(snippet)) {
    score += 15;
    reasons.push('Unchecked transfer/call (reentrancy risk)');
  }

  return { score, reasons };
}

export async function runSafetyCheck(dapp: GeneratedDapp): Promise<SafetyReport> {
  const combined = [
    dapp.smartContract,
    dapp.frontend,
    dapp.deploymentInstructions ?? '',
  ].join('\n');

  const { score: rawScore, reasons } = scoreSnippet(combined);
  const riskScore = Math.min(100, rawScore);

  const checksPassed: string[] = [];
  if (!PATTERNS.privateKey.test(combined)) checksPassed.push('No private keys in code');
  if (!PATTERNS.selfDestruct.test(combined)) checksPassed.push('No selfdestruct');
  if (riskScore <= 20) checksPassed.push('Low-risk transfer/call patterns');

  let verdict: SafetyVerdict = 'SAFE';
  if (riskScore >= 70) verdict = 'BLOCK';
  else if (riskScore >= 35 || reasons.length >= 2) verdict = 'REVIEW';

  return {
    verdict,
    riskScore,
    reasons: reasons.length > 0 ? reasons : ['No high-risk patterns detected'],
    checksPassed: checksPassed.length > 0 ? checksPassed : undefined,
  };
}
