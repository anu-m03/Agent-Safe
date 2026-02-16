import type { AgentRiskReport } from '@agent-safe/shared';

/**
 * Sentinel Agent – monitors wallet activity and new approvals.
 * TODO: Implement real approval monitoring, calldata parsing, etc.
 */
export async function runSentinelAgent(_txData: unknown): Promise<AgentRiskReport> {
  // TODO: Parse transaction calldata
  // TODO: Check for approve() / setApprovalForAll() calls
  // TODO: Check if spender is known / unknown
  // TODO: Detect "approve + transferFrom drain" patterns

  return {
    agent: 'SentinelAgent',
    risk_level: 'LOW',
    confidence: 0.5,
    reason: 'Stub: no analysis performed',
    recommended_action: 'ALLOW',
    timestamp: new Date().toISOString(),
  };
}
