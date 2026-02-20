import { z } from 'zod';

// ─── Intent Zod Schemas ─────────────────────────────────

export const ActionTypeSchema = z.enum([
  'EXECUTE_TX',
  'BLOCK_TX',
  'REVOKE_APPROVAL',
  'USE_PRIVATE_RELAY',
  'NOOP',
  // Rules engine allowed outputs (deterministic mapping only)
  'BLOCK_APPROVAL',
  'QUEUE_GOVERNANCE_VOTE',
  'LIQUIDATION_REPAY',
  'LIQUIDATION_ADD_COLLATERAL',
  'NO_ACTION',
]);

export const InputTxSchema = z.object({
  chainId: z.number().int(),
  from: z.string(),
  to: z.string(),
  data: z.string(),
  value: z.string(),
  kind: z.enum(['APPROVAL', 'SWAP', 'LEND', 'UNKNOWN']).optional(),
  metadata: z.record(z.unknown()).optional(),
});

export const ActionIntentSchema = z.object({
  intentId: z.string(),
  runId: z.string(),
  createdAt: z.number().optional(),
  action: ActionTypeSchema,
  chainId: z.number().int(),
  to: z.string(),
  value: z.string(),
  data: z.string(),
  meta: z.record(z.unknown()),
});

export const LogEventTypeSchema = z.enum([
  'AGENT_REPORT', 'AGENT_REPORTS', 'CONSENSUS', 'INTENT',
  'GOVERNANCE_RECOMMEND', 'GOVERNANCE_VOTE', 'GOVERNANCE_QUEUE', 'GOVERNANCE_VETO', 'GOVERNANCE_EXECUTE', 'GOVERNANCE_EXECUTE_FAIL', 'HEALTH_CHECK',
  'REQUEST', 'ERROR', 'SWARM_START', 'SWARM_END',
  'RULES_ENGINE', 'PAYMENT_FALLBACK', 'EXECUTION_SUCCESS', 'X402_PAYMENT', 'REVENUE', 'SPATIAL_GENERATION',
]);

export const LogLevelSchema = z.enum(['INFO', 'WARN', 'ERROR']);

export const LogEventSchema = z.object({
  id: z.string(),
  timestamp: z.number(),
  type: LogEventTypeSchema,
  runId: z.string().optional(),
  payload: z.unknown(),
  level: LogLevelSchema,
});
