// ─── Sponsor Integration Registry ────────────────────────
// Labels and metadata for ETHDenver sponsor bounty proof.

export interface SponsorEntry {
  name: string;
  slug: string;
  proofLabel: string;
  description: string;
  required: boolean;
}

export const SPONSORS: SponsorEntry[] = [
  {
    name: 'Base',
    slug: 'base',
    proofLabel: 'Primary L2',
    description:
      'Smart contracts deployed on Base (AgentSafeAccount, PolicyEngine, GovernanceModule, ProvenanceRegistry). ERC-4337 account abstraction.',
    required: true,
  },
  {
    name: 'QuickNode',
    slug: 'quicknode',
    proofLabel: 'RPC Provider',
    description:
      'Live RPC endpoint for Base chain interaction. Health check exposes blockNumber and connection status.',
    required: true,
  },
  {
    name: 'Kite AI',
    slug: 'kite',
    proofLabel: 'AI Summarisation',
    description:
      'AI-powered proposal summarisation and risk analysis pipeline. Works in live or stub mode.',
    required: true,
  },
  {
    name: 'Nouns / Snapshot',
    slug: 'nouns',
    proofLabel: 'Governance Feed',
    description:
      'Proposal ingestion from Snapshot / Nouns DAOs. Recommendation engine produces VoteIntent.',
    required: true,
  },
  {
    name: '0g',
    slug: '0g',
    proofLabel: 'Data Availability (Stretch)',
    description:
      'Decentralised log commitment for tamper-proof audit trails. Stretch goal — not required for MVP.',
    required: false,
  },
] as const;

export function getSponsor(slug: string): SponsorEntry | undefined {
  return SPONSORS.find((s) => s.slug === slug);
}
