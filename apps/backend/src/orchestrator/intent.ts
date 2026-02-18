import type {
  SwarmConsensusDecisionV2,
  ActionIntent,
  ActionType,
} from '@agent-safe/shared';
import crypto from 'node:crypto';

/**
 * Build an ActionIntent from the consensus decision and the original tx.
 *
 * Mapping:
 *   ALLOW  => EXECUTE_TX
 *   BLOCK  => BLOCK_TX
 *   REVIEW_REQUIRED + HIGH/CRITICAL => REVOKE_APPROVAL
 *   REVIEW_REQUIRED otherwise       => NOOP
 */
export function buildIntent(
  decision: SwarmConsensusDecisionV2,
  tx: { chainId: number; to: string; value: string; data: string },
): ActionIntent {
  let action: ActionType;

  switch (decision.decision) {
    case 'ALLOW':
      action = 'EXECUTE_TX';
      break;
    case 'BLOCK':
      action = 'BLOCK_TX';
      break;
    case 'REVIEW_REQUIRED':
      action =
        decision.finalSeverity === 'HIGH' || decision.finalSeverity === 'CRITICAL'
          ? 'REVOKE_APPROVAL'
          : 'NOOP';
      break;
    default:
      action = 'NOOP';
  }

  return {
    intentId: crypto.randomUUID(),
    runId: decision.runId,
    action,
    chainId: tx.chainId,
    to: tx.to,
    value: tx.value,
    data: tx.data,
    meta: {
      finalSeverity: decision.finalSeverity,
      finalRiskScore: decision.finalRiskScore,
      timestamp: decision.timestamp,
    },
  };
}
