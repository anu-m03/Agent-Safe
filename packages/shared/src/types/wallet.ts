// ─── Wallet Types ────────────────────────────────────────

/** Supported chain IDs */
export type SupportedChainId = 8453 | 84532; // Base mainnet / Base Sepolia

/**
 * Summary of a pending or completed transaction evaluation.
 */
export interface TransactionEvaluation {
  txHash?: string;
  from: string;
  to: string;
  value: string;
  data: string;
  chainId: SupportedChainId;
  simulation: SimulationResult;
  swarmDecision: import('./agent.js').SwarmConsensusDecision;
  policyCheck: PolicyCheckResult;
  timestamp: string;
}

/**
 * Result of an off-chain transaction simulation.
 */
export interface SimulationResult {
  success: boolean;
  gasEstimate: string;
  tokenTransfers: TokenTransfer[];
  approvalChanges: ApprovalChange[];
  priceImpact?: number; // percentage for swap txs
  error?: string;
}

export interface TokenTransfer {
  token: string;
  from: string;
  to: string;
  amount: string;
  symbol: string;
}

export interface ApprovalChange {
  token: string;
  spender: string;
  oldAllowance: string;
  newAllowance: string;
}

export interface PolicyCheckResult {
  passed: boolean;
  violations: string[];
}

/**
 * Audit log entry stored for every evaluated transaction or governance action.
 */
export interface AuditLogEntry {
  id: string;
  type: 'TX' | 'GOVERNANCE';
  timestamp: string;
  agentOutputs: import('./agent.js').AgentRiskReport[];
  consensusScore: number;
  finalDecision: string;
  txHash?: string;
  proposalId?: string;
  summary: string;
}
