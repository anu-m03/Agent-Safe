// ─── Intent & Transaction Input Types ────────────────────

/**
 * Input transaction to be evaluated by the SwarmGuard pipeline.
 */
export interface InputTx {
  chainId: number;
  from: string;
  to: string;
  data: string; // 0x-prefixed hex
  value: string; // decimal string, e.g. "0"
  kind?: 'APPROVAL' | 'SWAP' | 'LEND' | 'UNKNOWN';
  metadata?: Record<string, unknown>;
}

/**
 * Action to take after agent evaluation or consensus.
 * Each value is an allowlisted, deterministic execution path.
 * No generic "execute arbitrary calldata" types exist by design.
 */
export type ActionType =
  | 'EXECUTE_TX'
  | 'BLOCK_TX'
  | 'REVOKE_APPROVAL'
  | 'USE_PRIVATE_RELAY'
  | 'NOOP'
  // Rules engine allowed outputs (deterministic mapping only)
  | 'BLOCK_APPROVAL'
  | 'QUEUE_GOVERNANCE_VOTE'
  | 'LIQUIDATION_REPAY'
  | 'LIQUIDATION_ADD_COLLATERAL'
  | 'NO_ACTION'
  // ─── Autonomous swap execution (allowlist-only) ─────────
  // SWAP_REBALANCE: deterministic portfolio rebalance via Uniswap router.
  // Restricted to:
  //   - Allowlisted tokens only (hardcoded in callDataBuilder / agentExecute)
  //   - Allowlisted router target only (Uniswap Universal Router)
  //   - Session-key or backend-signer signed; NEVER arbitrary calldata
  //   - Guardrailed by slippage cap, price-impact cap, and amount cap
  | 'SWAP_REBALANCE';

/**
 * Concrete intent produced by the SwarmGuard pipeline.
 */
export interface ActionIntent {
  intentId: string;
  runId: string;
  createdAt?: number; // ms
  action: ActionType;
  chainId: number;
  to: string;
  value: string; // decimal string
  data: string; // 0x-prefixed hex
  meta: Record<string, unknown>;
}

/**
 * Structured log event persisted for every pipeline action.
 */
export type LogEventType =
  | 'AGENT_REPORT'
  | 'AGENT_REPORTS'
  | 'CONSENSUS'
  | 'INTENT'
  | 'GOVERNANCE_RECOMMEND'
  | 'GOVERNANCE_VOTE'
  | 'GOVERNANCE_QUEUE'
  | 'GOVERNANCE_VETO'
  | 'GOVERNANCE_EXECUTE'
  | 'GOVERNANCE_EXECUTE_FAIL'
  | 'HEALTH_CHECK'
  | 'REQUEST'
  | 'ERROR'
  | 'SWARM_START'
  | 'SWARM_END'
  | 'RULES_ENGINE'
  | 'PAYMENT_FALLBACK'
  | 'EXECUTION_SUCCESS'
  | 'X402_PAYMENT'
  | 'REVENUE'
  | 'SPATIAL_GENERATION';

export type LogLevel = 'INFO' | 'WARN' | 'ERROR';

export interface LogEvent {
  id: string;
  timestamp: number; // ms
  type: LogEventType;
  runId?: string;
  payload: unknown;
  level: LogLevel;
}
