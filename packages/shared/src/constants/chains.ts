// ─── Chain Configurations ────────────────────────────────

export interface ChainConfig {
  chainId: number;
  name: string;
  rpc: string;
  explorer: string;
  isTestnet: boolean;
}

export const CHAINS: Record<number, ChainConfig> = {
  8453: {
    chainId: 8453,
    name: 'Base',
    rpc: process.env.QUICKNODE_RPC_URL ?? 'https://mainnet.base.org',
    explorer: 'https://basescan.org',
    isTestnet: false,
  },
  84532: {
    chainId: 84532,
    name: 'Base Sepolia',
    rpc: process.env.QUICKNODE_RPC_URL ?? 'https://sepolia.base.org',
    explorer: 'https://sepolia.basescan.org',
    isTestnet: true,
  },
} as const;

export const DEFAULT_CHAIN_ID = 8453;
