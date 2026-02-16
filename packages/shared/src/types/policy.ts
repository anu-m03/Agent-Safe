// ─── Policy Types ────────────────────────────────────────

/**
 * On-chain policy configuration enforced by the Policy Engine contract.
 * AI agents cannot override these deterministic constraints.
 */
export interface PolicyConfig {
  /** Maximum spend per single transaction (in wei) */
  maxSpendPerTx: string;

  /** Maximum aggregate spend per 24-hour window (in wei) */
  maxSpendPerDay: string;

  /** Block unlimited (MAX_UINT) ERC-20 approvals by default */
  blockUnlimitedApprovals: boolean;

  /** Addresses allowed to interact with */
  contractAllowlist: string[];

  /** Addresses explicitly denied */
  contractDenylist: string[];

  /** ERC-20 tokens the wallet is allowed to hold / trade */
  tokenAllowlist: string[];

  /** ERC-20 tokens explicitly denied */
  tokenDenylist: string[];

  /** Maximum ETH reserved for automated defensive actions */
  defensePoolCap: string;

  /** Whether GovernanceSafe auto-vote is enabled */
  governanceAutoVoteEnabled: boolean;

  /** Veto window duration in seconds */
  vetoWindowSeconds: number;
}

/**
 * Default conservative policy – used as fallback.
 */
export const DEFAULT_POLICY: PolicyConfig = {
  maxSpendPerTx: '1000000000000000000', // 1 ETH
  maxSpendPerDay: '5000000000000000000', // 5 ETH
  blockUnlimitedApprovals: true,
  contractAllowlist: [],
  contractDenylist: [],
  tokenAllowlist: [],
  tokenDenylist: [],
  defensePoolCap: '500000000000000000', // 0.5 ETH
  governanceAutoVoteEnabled: false,
  vetoWindowSeconds: 3600, // 1 hour
};
