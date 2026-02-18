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
 * Action to take after SwarmGuard consensus.
 */
export type ActionType =
  | 'EXECUTE_TX'
  | 'BLOCK_TX'
  | 'REVOKE_APPROVAL'
  | 'USE_PRIVATE_RELAY'
  | 'NOOP';

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
  | 'HEALTH_CHECK'
  | 'REQUEST'
  | 'ERROR'
  | 'SWARM_START'
  | 'SWARM_END';

export type LogLevel = 'INFO' | 'WARN' | 'ERROR';

export interface LogEvent {
  id: string;
  timestamp: number; // ms
  type: LogEventType;
  runId?: string;
  payload: unknown;
  level: LogLevel;
}
