// ─── Contract Addresses (Placeholders — replace after deployment) ────

/**
 * Deployed contract addresses for AgentSafe.
 * These are placeholders. After deploying via Deploy.s.sol,
 * update with actual addresses from the deployment logs.
 */
export const CONTRACT_ADDRESSES = {
  /** AgentSafeAccount (ERC-4337 smart account) */
  AGENT_SAFE_ACCOUNT: '0x0000000000000000000000000000000000000000',
  /** PolicyEngine (guardrail enforcement) */
  POLICY_ENGINE: '0x0000000000000000000000000000000000000000',
  /** GovernanceModule (vote-only execution) */
  GOVERNANCE_MODULE: '0x0000000000000000000000000000000000000000',
  /** ProvenanceRegistry (swarm decision receipts) */
  PROVENANCE_REGISTRY: '0x0000000000000000000000000000000000000000',
  /** AgentBadgeNFT (ERC-721 agent identity) */
  AGENT_BADGE_NFT: '0x0000000000000000000000000000000000000000',
  /** AgentRegistry (agent TBA registry) */
  AGENT_REGISTRY: '0x0000000000000000000000000000000000000000',
  /** ERC-6551 Registry (Token Bound Accounts) */
  ERC6551_REGISTRY: '0x0000000000000000000000000000000000000000',
} as const;

// TODO: ABI export pipeline — generate ABIs from forge build output
// ABIs are located at: packages/contracts/out/<ContractName>.sol/<ContractName>.json
