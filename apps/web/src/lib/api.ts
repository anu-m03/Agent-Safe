import type { SwarmConsensusDecision, ProposalAnalysis, GovernanceProposal, AuditLogEntry } from '@agent-safe/shared';

const API_BASE = process.env.NEXT_PUBLIC_BACKEND_URL || 'http://localhost:4000';

/**
 * API client for the AgentSafe backend.
 * TODO: Add error handling, auth, retry logic.
 */
export const api = {
  /** Health check */
  async health(): Promise<{ status: string }> {
    const res = await fetch(`${API_BASE}/health`);
    return res.json();
  },

  /** @deprecated SwarmGuard removed. Use backendClient.evaluateTx only if backend restores route, or use marketplace/request-protection / execution. */
  async evaluateTx(txData: {
    to: string;
    value: string;
    data: string;
  }): Promise<SwarmConsensusDecision> {
    const res = await fetch(`${API_BASE}/api/swarm/evaluate-tx`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(txData),
    });
    return res.json();
  },

  /** @deprecated SwarmGuard removed. Use backendClient.getSwarmLogs only if backend restores /api/swarm/logs. */
  async getSwarmLogs(): Promise<{ logs: AuditLogEntry[] }> {
    const res = await fetch(`${API_BASE}/api/swarm/logs`);
    return res.json();
  },

  /** Fetch governance proposals */
  async getProposals(): Promise<{ proposals: GovernanceProposal[] }> {
    const res = await fetch(`${API_BASE}/api/governance/proposals`);
    return res.json();
  },

  /** Get recommendation for a proposal */
  async getRecommendation(proposalId: string): Promise<ProposalAnalysis> {
    const res = await fetch(`${API_BASE}/api/governance/recommend`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ proposalId }),
    });
    return res.json();
  },
};
