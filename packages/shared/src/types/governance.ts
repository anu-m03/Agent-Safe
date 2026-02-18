// ─── Governance Types ────────────────────────────────────

/** Vote direction */
export type VoteDirection = 'FOR' | 'AGAINST' | 'ABSTAIN';

/**
 * Parsed governance proposal metadata.
 */
export interface GovernanceProposal {
  id: string;
  title: string;
  body: string;
  space: string; // Snapshot space or DAO name
  author: string;
  start: number; // unix timestamp
  end: number;
  state: 'active' | 'closed' | 'pending';
  choices: string[];
  snapshot: string; // block number or IPFS hash
}

/**
 * Output of the governance analysis pipeline.
 */
export interface ProposalAnalysis {
  proposalId: string;
  summary: string;
  riskFlags: string[]; // e.g. ["treasury_drain", "quorum_manipulation"]
  recommendation: VoteDirection;
  confidence: number; // 0.0 – 1.0
  reasoning: string;
  isSuspicious: boolean;
  timestamp: string;
}

/**
 * Queued vote that can be vetoed before execution.
 */
export interface QueuedVote {
  id: string;
  proposalId: string;
  direction: VoteDirection;
  analysis: ProposalAnalysis;
  queuedAt: string;
  executeAfter: string; // ISO-8601 – veto window end
  status: 'queued' | 'executed' | 'vetoed' | 'expired';
}

// ─── V2 Governance Types (deterministic orchestrator) ────

/** Compact proposal summary for API consumers. */
export interface ProposalSummary {
  id: string;
  title: string;
  body: string;
  space: string;
  start: number;
  end: number;
  choices: string[];
  snapshot?: string;
  url?: string;
  source?: 'snapshot' | 'nouns';
  state?: 'active' | 'closed' | 'pending' | string;
  author?: string;
  votes?: number;
  scoresTotal?: number;
  quorum?: number;
}

/** Vote recommendation */
export type VoteRecommendation = 'FOR' | 'AGAINST' | 'ABSTAIN' | 'NO_ACTION';

/** V2 vote intent produced by the governance pipeline. */
export interface VoteIntent {
  intentId: string;
  proposalId: string;
  space: string;
  createdAt: number; // ms
  recommendation: VoteRecommendation;
  confidenceBps: number; // 0-10000
  reasons: string[];
  policyChecks: Record<string, unknown>;
  meta: Record<string, unknown>;
}
