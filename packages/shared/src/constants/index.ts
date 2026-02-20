// ─── Constants ───────────────────────────────────────────

/** Base Sepolia chain (testnet) */
export const BASE_SEPOLIA_CHAIN_ID = 84532;
/** Base mainnet */
export const BASE_MAINNET_CHAIN_ID = 8453;

/** Default ERC-4337 EntryPoint address (v0.6) */
export const ENTRY_POINT_ADDRESS = '0x5FF137D4b0FDCD49DcA30c7CF57E578a026d2789';

/** SwarmGuard polling interval in ms */
export const DEFAULT_POLL_INTERVAL_MS = 30_000;

/** Minimum polling interval in ms */
export const MIN_POLL_INTERVAL_MS = 15_000;

/** Maximum polling interval in ms */
export const MAX_POLL_INTERVAL_MS = 120_000;

/** Number of agents needed for consensus (MVP) */
export const CONSENSUS_THRESHOLD = 2;

/** Total active voting agents (excluding Coordinator & Defender) */
/** Specialists only (no MEV). */
export const TOTAL_VOTING_AGENTS = 3;

/** Default veto window for governance votes (seconds) */
export const DEFAULT_VETO_WINDOW_SECONDS = 3600;

/** MAX_UINT256 used for unlimited approvals */
export const MAX_UINT256 = '0xffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff';

/** Snapshot Hub URL */
export const SNAPSHOT_HUB_URL = 'https://hub.snapshot.org';

// Contract addresses (placeholder until deployment)
export { CONTRACT_ADDRESSES } from './contracts.js';

// Chain configurations
export { CHAINS, DEFAULT_CHAIN_ID } from './chains.js';
export type { ChainConfig } from './chains.js';

// Sponsor registry
export { SPONSORS, getSponsor } from './sponsors.js';
export type { SponsorEntry } from './sponsors.js';
