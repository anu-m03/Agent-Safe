import type { SwarmConsensusDecisionV2, ActionIntent, ConsensusDecision } from '@agent-safe/shared';

/**
 * Defender Agent – executes defensive actions when the swarm consensus
 * is BLOCK or REVIEW.  Currently simulates execution; real integration
 * would submit a UserOp to revoke approvals or cancel pending txns.
 */
export async function runDefenderAgent(
  decision: SwarmConsensusDecisionV2,
  intent?: ActionIntent | null,
): Promise<{ executed: boolean; action: string; txHash?: string }> {
  const shouldAct: ConsensusDecision[] = ['BLOCK', 'REVIEW_REQUIRED'];

  if (!shouldAct.includes(decision.decision)) {
    return { executed: false, action: 'NO_ACTION_NEEDED' };
  }

  console.log(
    `[DefenderAgent] Would execute defensive action: ${intent?.action ?? 'N/A'}`,
  );

  // In production this would build + submit a UserOp via EntryPoint.
  return {
    executed: false, // stub – no real on-chain tx
    action: intent?.action ?? 'BLOCK_TX',
    txHash: undefined,
  };
}
