import type { SwarmConsensusDecisionV2, ActionIntent } from '@agent-safe/shared';
import crypto from 'node:crypto';

export function buildIntent(
  decision: SwarmConsensusDecisionV2,
  tx: { chainId?: number; to: string; value?: string; data?: string },
): ActionIntent {

  // ─── Map decision → action ─────────────────────────────
  let action: ActionIntent['action'];

  switch (decision.decision) {
    case 'BLOCK':
      action = 'BLOCK_TX';
      break;
    case 'REVIEW_REQUIRED':
      action = 'USE_PRIVATE_RELAY';
      break;
    case 'ALLOW':
    default:
      action = 'EXECUTE_TX';
      break;
  }

  return {
    intentId: crypto.randomUUID(),
    runId: decision.runId,
    action,
    chainId: tx.chainId ?? 8453,
    to: tx.to,
    value: tx.value ?? '0',
    data: tx.data ?? '0x',
    meta: {
      finalSeverity: decision.finalSeverity,
      finalRiskScore: decision.finalRiskScore,
      timestamp: decision.timestamp,
    },
  };
}
